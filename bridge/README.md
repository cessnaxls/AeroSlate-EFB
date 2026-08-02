# AeroSlate Simulator Bridge

The hosted Render application cannot connect directly to a simulator on your local network. Run this small bridge on the simulator PC to publish MSFS or X-Plane telemetry to AeroSlate.

## Microsoft Flight Simulator

```powershell
py -m pip install SimConnect requests
py aeroslate_bridge.py --sim msfs --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

## X-Plane 11/12

```powershell
py -m pip install requests
py aeroslate_bridge.py --sim xplane --url https://YOUR-APP.onrender.com --token YOUR_SIM_LINK_TOKEN
```

The legacy `dispatchlink_bridge.py` remains in the repository so existing shortcuts continue to work. Both bridge versions use the same telemetry API.
