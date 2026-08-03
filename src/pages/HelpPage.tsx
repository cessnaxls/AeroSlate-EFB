import { CloudUpload, ExternalLink, HelpCircle, KeyRound, LockKeyhole } from 'lucide-react';

export function HelpPage() {
  return <div className="help-page content-grid two">
    <section className="card"><header><div><HelpCircle size={18}/><h3>Free cloud setup</h3></div></header><div className="card-body help-steps">
      <p>AeroSlate keeps trips, flight logs and duty logs on the device first. A private encrypted GitHub Gist can synchronize the same ledger between devices without a paid Render database.</p>
      <ol>
        <li><strong>Create a GitHub token.</strong><span>Open GitHub Settings → Developer settings → Personal access tokens. Create a fine-grained token with Gists read/write permission.</span></li>
        <li><strong>Open Flight Logs.</strong><span>Find the Cloud Vault panel and paste the token.</span></li>
        <li><strong>Create a passphrase.</strong><span>Use at least 12 characters. The passphrase encrypts the ledger before it leaves the device.</span></li>
        <li><strong>Create or connect the vault.</strong><span>AeroSlate creates a private Gist and stores its ID. Use the same Gist ID, token and passphrase on another device.</span></li>
        <li><strong>Synchronize.</strong><span>Trips, flight records and attached duty records merge by their immutable record IDs.</span></li>
      </ol>
      <button onClick={() => window.open('https://github.com/settings/personal-access-tokens/new', 'aeroslate-github-help')}><ExternalLink size={16}/> Open GitHub token settings</button>
    </div></section>
    <section className="card"><header><div><LockKeyhole size={18}/><h3>What is stored</h3></div></header><div className="card-body status-list">
      <div><span>On this device</span><strong>Working ledger and preferences</strong></div>
      <div><span>In the private Gist</span><strong>Encrypted vault only</strong></div>
      <div><span>Encryption</span><strong>AES-256-GCM</strong></div>
      <div><span>Passphrase</span><strong>Never sent to Render</strong></div>
      <div><span>GitHub token</span><strong>Stored only when you choose Remember</strong></div>
    </div></section>
    <section className="card"><header><div><CloudUpload size={18}/><h3>Using several devices</h3></div></header><div className="card-body"><p>Connect each device to the same private Gist. Synchronize before editing on a second device, then synchronize again after saving. AeroSlate merges records rather than replacing the complete ledger.</p><div className="notice warn"><KeyRound size={17}/><p>Keep the token and encryption passphrase in a password manager. AeroSlate cannot recover an unknown passphrase.</p></div></div></section>
  </div>;
}
