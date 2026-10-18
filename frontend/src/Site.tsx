import { useEffect, useState } from 'react';
import App from './App';
import LandingPage from './components/LandingPage';

export default function Site() {
  const [hash, setHash] = useState(window.location.hash);
  const inStudy = hash.startsWith('#study');
  const [opened, setOpened] = useState(inStudy);
  useEffect(() => {
    const navigate = () => {
      const next = window.location.hash;
      setHash(next);
      if (next.startsWith('#study')) { setOpened(true); window.scrollTo(0, 0); }
      else if (next === '#home' || !next) window.scrollTo(0, 0);
      else if (next === '#how-it-works') requestAnimationFrame(() => document.getElementById('how-it-works')?.scrollIntoView());
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  // Keep an opened workspace mounted: returning home must not discard pending requests or drafts.
  return <><div hidden={inStudy}><LandingPage /></div>{opened && <div hidden={!inStudy}><App guideRequested={hash === '#study/guide'} /></div>}</>;
}
