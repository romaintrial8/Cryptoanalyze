// Premier lancement : importer un export de plateforme, ou découvrir l'app avec des données d'exemple.
import { Icon } from './icons';
import { navigate } from './router';
import { showToast } from './kit';
import { loadDemo } from '../data/actions';

export function WelcomeCard({ className = '' }: { className?: string }) {
  return (
    <section className={'card g16 ' + className} aria-labelledby="welcome-t" data-component="WelcomeCard">
      <span className="empty-icon" style={{ alignSelf: 'center', width: 72, height: 72 }}><Icon name="wallet" size={36} /></span>
      <div className="stack-8 center">
        <h2 id="welcome-t" className="t-h3">Bienvenue dans CryptoAnalyze</h2>
        <p className="c-neutral">Importez l’historique brut de vos plateformes : l’app reconstitue vos positions, votre prix de revient, vos plus-values et vos revenus de staking, en dollars.</p>
      </div>
      <ol className="stack-8 t-caption c-neutral" style={{ paddingLeft: 'var(--space-20)', margin: 0 }}>
        <li><strong style={{ color: 'var(--text)' }}>Coinbase</strong> : Profil › Rapports › Générer un rapport › Historique des transactions (CSV).</li>
        <li><strong style={{ color: 'var(--text)' }}>Binance</strong> : Portefeuille › Historique des transactions › Générer tous les relevés (CSV ou ZIP).</li>
        <li><strong style={{ color: 'var(--text)' }}>Ledger</strong> : Ledger Live › Paramètres › Comptes › Exporter l’historique des opérations.</li>
        <li>Déposez les fichiers dans CryptoAnalyze : les doublons sont ignorés, vous pouvez réimporter à tout moment.</li>
      </ol>
      <button type="button" className="btn btn-primary block" onClick={() => navigate('/historique/import')}><Icon name="upload" size={20} />Importer mes fichiers</button>
      <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'center' }} onClick={() => { const n = loadDemo(); showToast(`${n} opérations d’exemple ajoutées`); }}>
        Essayer avec des données d’exemple
      </button>
      <p className="t-legal c-moderate center row" style={{ justifyContent: 'center' }}><Icon name="shield" size={14} />Aucune clé d’API, aucun mot de passe, aucune phrase de récupération ne vous sera jamais demandé.</p>
    </section>
  );
}
