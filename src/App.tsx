import { useEffect, useState } from 'react';
import { hideSplash } from './splash';
import { HOME, navigate, useRoute } from './ui/router';
import { TabBar, ToastHost } from './ui/kit';
import { PerformanceScreen, PortfolioScreen, RepartitionScreen } from './screens/Portfolio';
import { AddSheet, JournalScreen, OverviewScreen, TxSheet, useOpSheet } from './screens/History';
import { ImportScreen } from './screens/Import';
import { TxFormScreen } from './screens/TxForm';
import { CatalogScreen, CoinDetailScreen, MyCoinsScreen } from './screens/Markets';
import { DcaScreen, ProjectionScreen } from './screens/Simulator';
import { LoadingScreen, LoginScreen, MappingScreen, SettingsScreen } from './screens/Settings';
import { needsLogin, useSync } from './data/sync';

function Screen() {
  const route = useRoute();
  const [a, b, c] = route.parts;
  switch (a) {
    case 'portefeuille':
      if (b === 'repartition') return <RepartitionScreen />;
      if (b === 'performance') return <PerformanceScreen />;
      return <PortfolioScreen />;
    case 'historique':
      if (b === 'journal') return <JournalScreen />;
      if (b === 'import') return <ImportScreen />;
      if (b === 'saisie') return <TxFormScreen key={route.key} />;
      return <OverviewScreen />;
    case 'marches':
      if (b === 'catalogue') return <CatalogScreen />;
      if (b === 'crypto' && c) return <CoinDetailScreen key={c} symbol={decodeURIComponent(c).toUpperCase()} />;
      return <MyCoinsScreen />;
    case 'simulateur':
      if (b === 'projection') return <ProjectionScreen />;
      return <DcaScreen />;
    case 'parametres':
      if (b === 'symboles') return <MappingScreen />;
      return <SettingsScreen />;
    default:
      return <PortfolioScreen />;
  }
}

export function App() {
  const route = useRoute();
  const sync = useSync();
  const [, force] = useState(0);
  const sheet = route.query.get('sheet');
  const op = useOpSheet();
  const fullScreen = /^\/(historique\/(saisie|import)|parametres)/.test(route.path);

  useEffect(() => {
    if (!['portefeuille', 'marches', 'historique', 'simulateur', 'parametres'].includes(route.parts[0])) navigate(HOME, { replace: true });
  }, [route.parts]);

  const booting = sync.configured && !sync.ready;
  useEffect(() => { if (!booting) hideSplash(); }, [booting]);
  if (booting) return <LoadingScreen />;
  if (needsLogin()) return <LoginScreen onSkip={() => force((x) => x + 1)} />;

  return (
    <>
      <div className="app-main">
        <Screen />
      </div>
      {!fullScreen && <TabBar />}
      {sheet === 'ajouter' && <AddSheet />}
      {op && <TxSheet id={op} />}
      <ToastHost />
    </>
  );
}
