(() => {
  const config = window.DISPATCHLINK_CONFIG || {};
  const status = document.getElementById('status');
  const frame = document.getElementById('efb');
  const base = String(config.efbUrl || '').replace(/\/$/, '');
  const token = String(config.simLinkToken || '');

  if (!base || !token) {
    status.textContent = 'CONFIGURE EFB URL AND SIM LINK TOKEN';
    return;
  }

  frame.src = base;
  frame.addEventListener('load', () => document.body.classList.add('ready'));

  async function heartbeat() {
    try {
      const response = await fetch(`${base}/api/sim/heartbeat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sim-link-token': token },
        body: '{}',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch (error) {
      console.error('DispatchLink simulator heartbeat failed', error);
    }
  }

  void heartbeat();
  setInterval(heartbeat, 5000);
})();
