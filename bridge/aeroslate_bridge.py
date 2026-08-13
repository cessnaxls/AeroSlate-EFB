"""AeroSlate simulator bridge.

Connects locally to Microsoft Flight Simulator through Python-SimConnect or to
X-Plane 11/12 through its RREF UDP protocol, then sends simulator telemetry to
one AeroSlate EFB server. The hosted web application never connects directly
to the simulator process.

Install MSFS support:
    py -m pip install SimConnect

Run:
    py aeroslate_bridge.py --sim auto --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
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
            "simZuluSeconds": int(finite(self.get("ZULU_TIME"))) % 86400,
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
            "totalFuelLb": finite(self.get("FUEL_TOTAL_QUANTITY_WEIGHT")),
            "totalFuelKg": finite(self.get("FUEL_TOTAL_QUANTITY_WEIGHT")) * 0.45359237,
            "totalWeightLb": finite(self.get("TOTAL_WEIGHT")),
            "totalWeightKg": finite(self.get("TOTAL_WEIGHT")) * 0.45359237,
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
        XPlaneRef(14, "sim/flightmodel/weight/m_fuel_total"),
        XPlaneRef(15, "sim/flightmodel/weight/m_total"),
    ]

    BEACON_GROUP = "239.255.1.1"
    BEACON_PORT = 49707

    def __init__(self, host: str = "auto", port: int = 49000) -> None:
        self.values: dict[int, float] = {}
        discovered = self.discover_xplane()

        discovered_host = discovered["host"] if discovered else None
        advertised_port = discovered["port"] if discovered else None
        label = discovered["label"] if discovered else None

        if discovered:
            print(f"Found {label} at {discovered_host}:{advertised_port}")
            print(
                "Beacon fields: "
                f"major={discovered['major']} minor={discovered['minor']} "
                f"host_id={discovered['host_id']} version={discovered['version']} "
                f"role={discovered['role']} port={discovered['port']}"
            )
        else:
            print("No X-Plane multicast beacon found.")

        if host.lower() not in {"auto", "discover"}:
            candidates = [(host, port, "manual")]
        else:
            candidate_hosts: list[str] = []
            for h in [discovered_host, "127.0.0.1"]:
                if h and h not in candidate_hosts:
                    candidate_hosts.append(h)

            candidate_ports: list[int] = []
            for p in [advertised_port, 49010, 49000, port]:
                if isinstance(p, int) and 1 <= p <= 65535 and p not in candidate_ports:
                    candidate_ports.append(p)

            candidates = [(h, p, "auto") for h in candidate_hosts for p in candidate_ports]

        working = self.diagnose_candidates(candidates)
        if not working:
            tried = ", ".join(f"{h}:{p}" for h, p, _ in candidates)
            raise RuntimeError(
                "No X-Plane UDP endpoint answered the diagnostic probes. "
                f"Tried: {tried}. "
                "Beacon discovery worked, so X-Plane is broadcasting, but no unicast RREF/RPOS reply was received. "
                "This strongly points to X-Plane UDP receive configuration or a Windows/firewall/security rule blocking the reply path."
            )

        self.target = working
        print(f"Using X-Plane endpoint {self.target[0]}:{self.target[1]}")
        print("Subscribing to AeroSlate telemetry datarefs…")

        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("0.0.0.0", 0))
        self.sock.settimeout(1.5)
        for ref in self.refs:
            self._subscribe_ref(ref)

    @classmethod
    def discover_xplane(cls, timeout: float = 4.0) -> dict[str, Any] | None:
        beacon = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        try:
            beacon.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            beacon.bind(("", cls.BEACON_PORT))
            membership = socket.inet_aton(cls.BEACON_GROUP) + socket.inet_aton("0.0.0.0")
            beacon.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, membership)
            beacon.settimeout(0.5)

            print(f"Listening for X-Plane multicast beacon on {cls.BEACON_GROUP}:{cls.BEACON_PORT}…")
            deadline = time.time() + timeout
            while time.time() < deadline:
                try:
                    data, addr = beacon.recvfrom(4096)
                except socket.timeout:
                    continue
                if not data.startswith(b"BECN\x00"):
                    continue

                # X-Plane BECN structure after 5-byte "BECN\\0":
                # uint8 beacon_major_version
                # uint8 beacon_minor_version
                # int32 application_host_id
                # int32 version_number
                # uint32 role
                # uint16 port
                # char computer_name[]
                if len(data) < 21:
                    continue

                major = data[5]
                minor = data[6]
                host_id = struct.unpack_from("<i", data, 7)[0]
                version = struct.unpack_from("<i", data, 11)[0]
                role = struct.unpack_from("<I", data, 15)[0]
                advertised_port = struct.unpack_from("<H", data, 19)[0]

                computer_name = ""
                if len(data) > 21:
                    computer_name = data[21:].split(b"\x00", 1)[0].decode("utf-8", "ignore").strip()

                label = f"X-Plane {version}"
                if computer_name:
                    label += f" ({computer_name})"

                return {
                    "host": addr[0],
                    "port": advertised_port,
                    "label": label,
                    "major": major,
                    "minor": minor,
                    "host_id": host_id,
                    "version": version,
                    "role": role,
                    "computer_name": computer_name,
                }
        except OSError as exc:
            print(f"Beacon discovery unavailable: {exc}")
            return None
        finally:
            beacon.close()
        return None

    @staticmethod
    def _make_rref_packet(index: int, dataref: str, frequency: int = 2) -> bytes:
        encoded = dataref.encode("ascii")[:399]
        return (
            b"RREF\x00"
            + struct.pack("<ii", frequency, index)
            + encoded
            + b"\x00" * (400 - len(encoded))
        )

    @staticmethod
    def _make_rpos_packet() -> bytes:
        # RPOS is a lightweight independent UDP probe supported by X-Plane's UDP protocol.
        return b"RPOS\x00"

    @classmethod
    def _probe_endpoint(cls, host: str, port: int, timeout: float = 1.4) -> dict[str, Any]:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind(("0.0.0.0", 0))
        sock.settimeout(0.20)
        result = {"rref": False, "rpos": False, "packets": [], "source": None}

        try:
            # RREF test
            sock.sendto(cls._make_rref_packet(900, "sim/time/zulu_time_sec", 2), (host, port))
            deadline = time.time() + timeout
            while time.time() < deadline:
                try:
                    data, src = sock.recvfrom(8192)
                except socket.timeout:
                    continue
                result["source"] = src
                result["packets"].append(data[:16])
                if data.startswith((b"RREF,", b"RREF\x00")):
                    body = data[5:]
                    for offset in range(0, len(body) - 7, 8):
                        index, _value = struct.unpack("<if", body[offset:offset + 8])
                        if index == 900:
                            result["rref"] = True
                            break
                    if result["rref"]:
                        break

            # Independent RPOS probe if RREF did not answer
            if not result["rref"]:
                sock.sendto(cls._make_rpos_packet(), (host, port))
                deadline = time.time() + 0.9
                while time.time() < deadline:
                    try:
                        data, src = sock.recvfrom(8192)
                    except socket.timeout:
                        continue
                    result["source"] = src
                    result["packets"].append(data[:16])
                    if data.startswith(b"RPOS"):
                        result["rpos"] = True
                        break
        finally:
            sock.close()

        return result

    @classmethod
    def diagnose_candidates(cls, candidates: list[tuple[str, int, str]]) -> tuple[str, int] | None:
        print("Running X-Plane UDP diagnostics…")
        for host, port, origin in candidates:
            print(f"  Testing {host}:{port} ({origin})")
            result = cls._probe_endpoint(host, port)
            packet_types = []
            for packet in result["packets"]:
                if packet:
                    try:
                        packet_types.append(packet[:5].decode("ascii", "replace"))
                    except Exception:
                        packet_types.append(repr(packet[:5]))
            packet_summary = ", ".join(packet_types) if packet_types else "none"

            print(
                f"    RREF={'YES' if result['rref'] else 'no'} "
                f"RPOS={'YES' if result['rpos'] else 'no'} "
                f"UDP packets={packet_summary}"
            )

            if result["rref"]:
                print(f"    ✓ RREF telemetry works at {host}:{port}")
                return (host, port)
            if result["rpos"]:
                print(f"    ✓ X-Plane answered RPOS at {host}:{port}; UDP works, but RREF is not answering.")
                # Prefer an RREF-capable endpoint, but remember this one.
                rpos_working = (host, port)
            else:
                rpos_working = None

        # A working RPOS endpoint still proves the UDP path; return it only if no RREF target exists.
        for host, port, origin in candidates:
            result = cls._probe_endpoint(host, port, timeout=0.7)
            if result["rpos"]:
                print(f"Using {host}:{port} because X-Plane answered RPOS, although RREF remains unavailable.")
                return (host, port)

        return None

    def _subscribe_ref(self, ref: XPlaneRef) -> None:
        self.sock.sendto(self._make_rref_packet(ref.index, ref.dataref, ref.frequency), self.target)

    def _receive(self) -> None:
        deadline = time.time() + 0.8
        while time.time() < deadline:
            try:
                data, _ = self.sock.recvfrom(8192)
            except socket.timeout:
                break
            if not data.startswith((b"RREF,", b"RREF\x00")):
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
            raise RuntimeError(
                f"Connected to X-Plane UDP at {self.target[0]}:{self.target[1]}, "
                "but the AeroSlate RREF subscriptions have not produced latitude/longitude yet."
            )
        lat = finite(self.values.get(1)); lon = finite(self.values.get(2))
        directory, file_number = tcalc_indices(lat, lon)
        elevation_m = finite(self.values.get(4)); agl_m = finite(self.values.get(5))
        return {
            "simulator": self.name,
            "simZulu": hhmmz(self.values.get(9)),
            "simZuluSeconds": int(finite(self.values.get(9))) % 86400,
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
            "totalFuelKg": finite(self.values.get(14)),
            "totalFuelLb": finite(self.values.get(14)) * 2.2046226218,
            "totalWeightKg": finite(self.values.get(15)),
            "totalWeightLb": finite(self.values.get(15)) * 2.2046226218,
        }

    def close(self) -> None:
        try:
            self.sock.close()
        except Exception:
            pass


def post_json(url: str, token: str, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url.rstrip("/") + "/api/sim/telemetry",
        data=body,
        method="POST",
        headers={"content-type": "application/json", "x-sim-link-token": token, "user-agent": "AeroSlate-Bridge/1.0"},
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
    parser = argparse.ArgumentParser(description="AeroSlate MSFS/X-Plane telemetry bridge")
    parser.add_argument("--sim", choices=["auto", "msfs", "xplane"], default="auto")
    parser.add_argument("--url", required=True, help="AeroSlate server URL")
    parser.add_argument("--token", required=True, help="SIM_LINK_TOKEN configured on the server")
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--xplane-host", default="auto", help="X-Plane host/IP, or auto for beacon discovery + diagnostics")
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
