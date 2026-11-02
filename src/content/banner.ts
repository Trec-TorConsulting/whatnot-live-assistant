const ID = 'wn2-worker-banner';

export const showWorkerBanner = (text: string) => {
  let host = document.getElementById(ID);
  if (!host) {
    host = document.createElement('div');
    host.id = ID;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        div {
          position: fixed; bottom: 16px; left: 16px; z-index: 2147483647;
          padding: 8px 12px; border-radius: 8px; max-width: 320px;
          font: 500 12px/1.4 system-ui, sans-serif; color: #fff;
          background: rgba(17, 24, 39, 0.92); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          pointer-events: none;
        }
      </style>
      <div></div>`;
    document.documentElement.appendChild(host);
  }
  const box = host.shadowRoot?.querySelector('div');
  if (box) box.textContent = text;
};

export const hideWorkerBanner = () => document.getElementById(ID)?.remove();
