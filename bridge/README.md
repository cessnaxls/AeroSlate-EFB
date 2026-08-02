# DispatchLink Simulator Bridge

The Render-hosted EFB cannot directly open local SimConnect or X-Plane UDP sockets. Run this bridge on the simulator PC.

## Microsoft Flight Simulator

```powershell
py -m pip install SimConnect
py dispatchlink_bridge.py --sim msfs --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

## X-Plane 11/12

```powershell
py dispatchlink_bridge.py --sim xplane --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

X-Plane uses the native RREF UDP protocol on port 49000. Use `--xplane-host` and `--xplane-port` when needed.

The bridge sends only the displayed simulator telemetry and no Navigraph credentials.
