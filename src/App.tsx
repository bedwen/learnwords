import { Routes, Route, Navigate, NavLink, Link } from 'react-router-dom';
import logo from './assets/logo.png';
import logoDark from './assets/logo-dark.png';
import { Words } from './pages/Words';
import { Study } from './pages/Study';
import { Dashboard } from './pages/Dashboard';
import { Statistics } from './pages/Statistics';
import { DataManagement } from './pages/DataManagement';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';

function App() {
  const navLinkClass = ({ isActive }: { isActive: boolean }) => `
    px-4 py-2 font-medium transition-colors
    ${isActive 
      ? 'text-surface-900 border-b-2 border-surface-900' 
      : 'text-surface-500 hover:text-surface-900'
    }
  `;

  return (
    <ToastProvider>
    <div className="min-h-screen bg-background text-surface-900 transition-colors duration-200">
      {/* Navigation */}
      <nav className="bg-card border-b border-surface-200 sticky top-0 z-40 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/dashboard" className="flex items-center">
                <img src={logo} alt="LearnWords" className="h-9 dark:hidden" />
                <img src={logoDark} alt="LearnWords" className="h-9 hidden dark:block" />
              </Link>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/words" className={navLinkClass}>
                Words
              </NavLink>
              <NavLink to="/study" className={navLinkClass}>
                Study
              </NavLink>
              <NavLink to="/statistics" className={navLinkClass}>
                Statistics
              </NavLink>
              <NavLink to="/data" className={navLinkClass}>
                Data
              </NavLink>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ErrorBoundary>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/words" element={<Words />} />
            <Route path="/study" element={<Study />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/data" element={<DataManagement />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
    </ToastProvider>
  );
}

export default App;
