// If the map throws while drawing (a graphics driver problem, an old browser), only the map is
// replaced by a short note. The charts, numbers and downloads beside it keep working.
import { Component } from 'react';
import T from '../content/text.js';

export default class MapBoundary extends Component {
  constructor(props) { super(props); this.state = { broken: false }; }
  static getDerivedStateFromError() { return { broken: true }; }
  componentDidCatch(err) { console.error('[SHIFT map]', err); this.props.onFail?.(); }
  render() {
    if (this.state.broken) return <div className="map map-failed" role="note"><p>{T.map.mapFailed}</p></div>;
    return this.props.children;
  }
}
