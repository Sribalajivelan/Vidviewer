'use client';

import { useState } from 'react';

export default function AddSourceModal({ open, onClose, onCreated }) {
  const [type, setType] = useState('local');
  const [localError, setLocalError] = useState('');
  const [ftpError, setFtpError] = useState('');

  if (!open) return null;

  async function submitLocal(e) {
    e.preventDefault();
    setLocalError('');
    const data = new FormData(e.target);
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'local', name: data.get('name'), rootPath: data.get('rootPath') }),
    });
    const body = await res.json();
    if (!res.ok) return setLocalError(body.error || 'Failed to add source');
    e.target.reset();
    onCreated(body);
  }

  async function submitFtp(e) {
    e.preventDefault();
    setFtpError('Connecting\u2026');
    const data = new FormData(e.target);
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ftp',
        name: data.get('name'),
        host: data.get('host'),
        port: data.get('port'),
        username: data.get('username'),
        password: data.get('password'),
        secure: data.get('secure') === 'on',
        basePath: data.get('basePath') || '/',
      }),
    });
    const body = await res.json();
    if (!res.ok) return setFtpError(body.error || 'Failed to add source');
    setFtpError('');
    e.target.reset();
    onCreated(body);
  }

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <button className="close-btn modal-close" title="Close" onClick={onClose}>
          &times;
        </button>
        <h2>Add a source</h2>

        <div className="tabs-inline">
          <button
            type="button"
            className={'tab-btn' + (type === 'local' ? ' active' : '')}
            onClick={() => setType('local')}
          >
            Folder on this computer
          </button>
          <button
            type="button"
            className={'tab-btn' + (type === 'ftp' ? ' active' : '')}
            onClick={() => setType('ftp')}
          >
            FTP (e.g. phone)
          </button>
        </div>

        {type === 'local' && (
          <form className="source-form" onSubmit={submitLocal}>
            <label>
              Name
              <input type="text" name="name" placeholder="My Videos" required />
            </label>
            <label>
              Folder path
              <input type="text" name="rootPath" placeholder="/home/me/Videos or C:\Users\me\Videos" required />
            </label>
            <p className="hint">Any folder on the machine running this server.</p>
            <button type="submit">Add folder</button>
            <p className="form-error">{localError}</p>
          </form>
        )}

        {type === 'ftp' && (
          <form className="source-form" onSubmit={submitFtp}>
            <label>
              Name
              <input type="text" name="name" placeholder="My Phone" required />
            </label>
            <label>
              Host / IP
              <input type="text" name="host" placeholder="192.168.1.42" required />
            </label>
            <div className="row">
              <label>
                Port
                <input type="number" name="port" defaultValue={21} />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="secure" /> FTPS
              </label>
            </div>
            <label>
              Username
              <input type="text" name="username" placeholder="(blank for anonymous)" />
            </label>
            <label>
              Password
              <input type="password" name="password" />
            </label>
            <label>
              Base folder on server
              <input type="text" name="basePath" defaultValue="/" />
            </label>
            <p className="hint">Start an FTP server app on your phone, then enter the address it shows you here.</p>
            <button type="submit">Connect &amp; add</button>
            <p className="form-error">{ftpError}</p>
          </form>
        )}
      </div>
    </div>
  );
}
