// The app shell: header, navigation between views, the colour theme, and loading meta.json.
import { useEffect, useState } from 'react';
import T from './content/text.js';
import useTheme from './theme/useTheme.js';
import Explore from './pages/Explore.jsx';
import Switch2012 from './pages/Switch2012.jsx';
import Validation from './pages/Validation.jsx';
import Method from './pages/Method.jsx';
import { dateOf, json, lastDataDay } from './lib/data.js';
import { longDate } from './lib/format.js';
import { readHash, writeHash } from './lib/url.js';
import { recentStatus } from './lib/recent.js';

const VIEWS = Object.keys(T.views);

export default function App() {
  const [theme, mode, setMode] = useTheme();
  const [{ view, params }] = useState(() => { const h = readHash(); return { view: VIEWS.includes(h.view) ? h.view : 'explore', params: h.params }; });
  const [current, setCurrent] = useState(view);
  const [meta, setMeta] = useState(null);
  const [recent, setRecent] = useState(null);
  useEffect(() => { recentStatus().then(setRecent); }, []);
  const [error, setError] = useState(null);

  useEffect(() => { json('meta.json').then(setMeta).catch(() => setError(T.loadError)); }, []);
  useEffect(() => { if (current !== 'explore') writeHash(current); }, [current]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>{T.brand}</h1>
          <p>{T.tagline}</p>
        </div>
        <div className="top-right">
          {meta && <span className="badge">{T.dataTo(longDate(dateOf(meta, lastDataDay(meta))))}</span>}
          {recent?.latest_detection_utc && <span className="badge">{T.recentTo(recent.latest_detection_utc.replace('T', ' ').replace('Z', ' UTC'))}</span>}
          <label className="theme-pick">{T.theme.label}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {['system', 'light', 'dark'].map((m) => <option key={m} value={m}>{T.theme[m]}</option>)}
            </select>
          </label>
        </div>
        <nav aria-label="Views">
          {VIEWS.map((id) => (
            <button key={id} className={current === id ? 'tab on' : 'tab'} aria-current={current === id ? 'page' : undefined}
              onClick={() => setCurrent(id)}>{T.views[id]}</button>
          ))}
        </nav>
      </header>

      {error && <main className="page"><p className="notice" role="alert">{error}</p></main>}
      {current === 'explore' && meta && <Explore meta={meta} theme={theme} params={view === 'explore' ? params : {}} />}
      {current === 'switch' && <Switch2012 theme={theme} />}
      {current === 'validation' && <Validation />}
      {current === 'method' && <Method meta={meta} />}
    </div>
  );
}
