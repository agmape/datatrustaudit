import { Link } from 'react-router-dom';
import LocaleSelector from '@/components/LocaleSelector';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import logoIcon from '@/assets/logo/datatrust-logo-icon.png';

const MinimalTopMenu = () => (
  <nav className="fixed inset-x-0 top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl">
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
      <Link to="/" className="flex items-center group shrink-0">
        <div className="bg-white rounded-lg px-3 py-1.5 flex items-center justify-center group-hover:opacity-90 transition-opacity duration-200 shadow-sm">
          <img
            src={logoIcon}
            alt="DataTrust Audit"
            className="h-8 w-auto object-contain"
            draggable={false}
          />
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeSwitcher />
        <LocaleSelector compact />
      </div>
    </div>
  </nav>
);

export default MinimalTopMenu;
