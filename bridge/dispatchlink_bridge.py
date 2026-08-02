"""DispatchLink simulator bridge.

Connects locally to Microsoft Flight Simulator through Python-SimConnect or to
X-Plane 11/12 through its RREF UDP protocol, then sends simulator telemetry to
one DispatchLink EFB server. The hosted web application never connects directly
to the simulator process.

Install MSFS support:
    py -m pip install SimConnect

Run:
    py dispatchlink_bridge.py --sim auto --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
"""
from __future__ import annotations

import argparse
import json
import math
import socket
import struct
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

SURFACE_TYPES = {
    0: "Concrete", 1: "Grass", 2: "Water", 3: "Grass (Bumpy)", 4: "Asphalt",
    5: "Short Grass", 6: "Long Grass", 7: "Hard Turf", 8: "Snow", 9: "Ice",
    10: "Urban", 11: "Forest", 12: "Dirt", 13: "Coral", 14: "Gravel",
    15: "Oil Treated", 16: "Steel Mats", 17: "Bituminous", 18: "Brick",
    19: "Macadam", 20: "Planks", 21: "Sand", 22: "Shale", 23: "Tarmac",
}
SURFACE_CONDITIONS = {0: "Normal", 1: "Wet", 2: "Icy", 3: "Snow"}


def tcalc_indices(latitude: float, longitude: float) -> tuple[str, str]:
    directory_1 = int(((180.0 + longitude) * 12) / 360.0)
    directory_2 = int(((90.0 - latitude) * 8) / 180.0)
    file_1 = int(((180.0 + longitude) * 96) / 360.0)
    file_2 = int(((90.0 - latitude) * 64) / 180.0)
    return f"{directory_1:02d}{directory_2:02d}", f"{file_1:02d}{file_2:02d}"


def hhmmz(seconds: float | int | None) -> str:
    total = int(float(seconds or 0)) % 86400
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}z"


def finite(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


class MsfsReader:
    name = "MSFS / SimConnect"

    def __init__(self) -> None:
        from SimConnect import SimConnect, AircraftRequests  # type: ignore
        self.sm = SimConnect()
        self.aq = AircraftRequests(self.sm, _time=100)

    def get(self, name: str, default: Any = None) -> Any:
        try:
            value = self.aq.get(name)
            return default if value is None else value
        except Exception:
            return default

    def read(self) -> dict[str, Any]:
        lat = finite(self.get("PLANE_LATITUDE"))
        lon = finite(self.get("PLANE_LONGITUDE"))
        directory, file_number = tcalc_indices(lat, lon)
        engine_1 = finite(self.get("GENERAL_ENG_COMBUSTION_1")) > 0.5
        engine_2 = finite(self.get("GENERAL_ENG_COMBUSTION_2")) > 0.5
        surface = int(finite(self.get("SURFACE_TYPE"), -1))
        condition = int(finite(self.get("SURFACE_CONDITION"), -1))
        altitude_msl = finite(self.get("PLANE_ALTITUDE"))
        ground_altitude_m = finite(self.get("GROUND_ALTITUDE"))
        return {
            "simulator": self.name,
            "simZulu": hhmmz(self.get("ZULU_TIME")),
            "latitude": lat,
            "longitude": lon,
            "headingTrue": math.degrees(finite(self.get("PLANE_HEADING_DEGREES_TRUE"))) % 360,
            "altitudeMslFt": altitude_msl,
            "altitudeAglFt": finite(self.get("PLANE_ALT_ABOVE_GROUND")),
            "groundAltitudeM": ground_altitude_m,
            "groundSpeedKt": finite(self.get("GROUND_VELOCITY")),
            "indicatedAirspeedKt": finite(self.get("AIRSPEED_INDICATED")),
            "verticalSpeedFpm": finite(self.get("VERTICAL_SPEED")),
            "onGround": finite(self.get("SIM_ON_GROUND")) > 0.5,
            "parkingBrake": finite(self.get("BRAKE_PARKING_POSITION")) > 0.5,
            "enginesRunning": engine_1 or engine_2,
            "surfaceType": SURFACE_TYPES.get(surface, "Unknown"),
            "surfaceCondition": SURFACE_CONDITIONS.get(condition, "Unknown"),
            "tcalcDirectory": directory,
            "tcalcFile": file_number,
            "aircraftTitle": str(self.get("TITLE", "")),
            "registration": str(self.get("ATC_ID", "")),
        }

    def close(self) -> None:
        try:
            self.sm.exit()
        except Exception:
            pass


@dataclass
class XPlaneRef:
    index: int
    dataref: str
    frequency: int = 5


class XPlaneReader:
    name = "X-Plane 11/12"
    refs = [
        XPlaneRef(1, "sim/flightmodel/position/latitude"),
        XPlaneRef(2, "sim/flightmodel/position/longitude"),
        XPlaneRef(3, "sim/flightmodel/position/true_psi"),
        XPlaneRef(4, "sim/flightmodel/position/elevation"),
        XPlaneRef(5, "sim/flightmodel/position/y_agl"),
        XPlaneRef(6, "sim/flightmodel/position/groundspeed"),
        XPlaneRef(7, "sim/flightmodel/position/indicated_airspeed"),
        XPlaneRef(8, "sim/flightmodel/position/vh_ind_fpm"),
        XPlaneRef(9, "sim/time/zulu_time_sec"),
        XPlaneRef(10, "sim/flightmodel/failures/onground_any"),
        XPlaneRef(11, "sim/cockpit2/controls/parking_brake_ratio"),
        XPlaneRef(12, "sim/flightmodel/engine/ENGN_running[0]"),
        XPlaneRef(13, "sim/flightmodel/engine/ENGN_running[1]"),
    ]

    def __init__(self, host: str = "127.0.0.1", port: int = 49000) -> None:
        self.target = (host, port)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("0.0.0.0", 0))
        self.sock.settimeout(1.5)
        self.values: dict[int, float] = {}
        for ref in self.refs:
            encoded = ref.dataref.encode("ascii")[:399]
            packet = b"RREF\x00" + struct.pack("<ii", ref.frequency, ref.index) + encoded + b"\x00" * (400 - len(encoded))
            self.sock.sendto(packet, self.target)

    def _receive(self) -> None:
        deadline = time.time() + 0.8
        while time.time() < deadline:
            try:
                data, _ = self.sock.recvfrom(8192)
            except socket.timeout:
                break
            if not data.startswith(b"RREF\x00"):
                continue
            body = data[5:]
            for offset in range(0, len(body) - 7, 8):
                index, value = struct.unpack("<if", body[offset:offset + 8])
                self.values[index] = value
            if len(self.values) >= 9:
                break

    def read(self) -> dict[str, Any]:
        self._receive()
        if 1 not in self.values or 2 not in self.values:
            raise RuntimeError("No X-Plane RREF data received. Confirm X-Plane is running and UDP port 49000 is available.")
        lat = finite(self.values.get(1)); lon = finite(self.values.get(2))
        directory, file_number = tcalc_indices(lat, lon)
        elevation_m = finite(self.values.get(4)); agl_m = finite(self.values.get(5))
        return {
            "simulator": self.name,
            "simZulu": hhmmz(self.values.get(9)),
            "latitude": lat,
            "longitude": lon,
            "headingTrue": finite(self.values.get(3)) % 360,
            "altitudeMslFt": elevation_m * 3.28084,
            "altitudeAglFt": agl_m * 3.28084,
            "groundAltitudeM": max(0.0, elevation_m - agl_m),
            "groundSpeedKt": finite(self.values.get(6)) * 1.94384,
            "indicatedAirspeedKt": finite(self.values.get(7)),
            "verticalSpeedFpm": finite(self.values.get(8)),
            "onGround": finite(self.values.get(10)) > 0.5,
            "parkingBrake": finite(self.values.get(11)) > 0.5,
            "enginesRunning": finite(self.values.get(12)) > 0.5 or finite(self.values.get(13)) > 0.5,
            "surfaceType": "Unknown (X-Plane dataref not configured)",
            "surfaceCondition": "Unknown",
            "tcalcDirectory": directory,
            "tcalcFile": file_number,
            "aircraftTitle": "X-Plane aircraft",
            "registration": "",
        }

    def close(self) -> None:
        self.sock.close()


def post_json(url: str, token: str, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url.rstrip("/") + "/api/sim/telemetry",
        data=body,
        method="POST",
        headers={"content-type": "application/json", "x-sim-link-token": token, "user-agent": "DispatchLink-Bridge/1.0"},
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        if response.status >= 300:
            raise RuntimeError(f"Server returned HTTP {response.status}")


def connect_reader(mode: str, host: str, port: int):
    errors: list[str] = []
    if mode in {"auto", "msfs"}:
        try:
            return MsfsReader()
        except Exception as exc:
            errors.append(f"MSFS: {exc}")
            if mode == "msfs":
                raise
    if mode in {"auto", "xplane"}:
        try:
            reader = XPlaneReader(host, port)
            reader.read()
            return reader
        except Exception as exc:
            errors.append(f"X-Plane: {exc}")
            if mode == "xplane":
                raise
    raise RuntimeError("; ".join(errors) or "No simulator mode available")


def main() -> int:
    parser = argparse.ArgumentParser(description="DispatchLink MSFS/X-Plane telemetry bridge")
    parser.add_argument("--sim", choices=["auto", "msfs", "xplane"], default="auto")
    parser.add_argument("--url", required=True, help="DispatchLink server URL")
    parser.add_argument("--token", required=True, help="SIM_LINK_TOKEN configured on the server")
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--xplane-host", default="127.0.0.1")
    parser.add_argument("--xplane-port", type=int, default=49000)
    args = parser.parse_args()

    reader = None
    try:
        print("Connecting to simulator…")
        reader = connect_reader(args.sim, args.xplane_host, args.xplane_port)
        print(f"Connected: {reader.name}")
        print(f"Publishing telemetry to {args.url}")
        consecutive_errors = 0
        while True:
            try:
                payload = reader.read()
                post_json(args.url, args.token, payload)
                consecutive_errors = 0
                print(f"\r{payload.get('simZulu', '—')}  {payload.get('latitude', 0):.5f}, {payload.get('longitude', 0):.5f}  GS {payload.get('groundSpeedKt', 0):.1f} kt", end="", flush=True)
            except (urllib.error.URLError, TimeoutError) as exc:
                consecutive_errors += 1
                print(f"\nNetwork error ({consecutive_errors}): {exc}")
            except Exception as exc:
                print(f"\nSimulator read error: {exc}")
                return 2
            time.sleep(max(0.2, args.interval))
    except KeyboardInterrupt:
        print("\nStopped.")
        return 0
    except Exception as exc:
        print(f"Bridge failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if reader is not None:
            reader.close()


if __name__ == "__main__":
    raise SystemExit(main())
