import { Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import {
  Home as HomeIcon,
  BookOpen,
  GraduationCap,
  BarChart3,
  Database,
} from 'lucide-react';
import logo from './assets/logo.png';
import logoDark from './assets/logo-dark.png';
import { Words } from './pages/Words';
import { Study } from './pages/Study';
import { Home } from './pages/Home';
import { Statistics } from './pages/Statistics';
import { DataManagement } from './pages/DataManagement';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { cn } from './lib/utils';

function App() {
  const location = useLocation();
  const isStudy = location.pathname.startsWith('/study');

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
      isActive
        ? 'bg-secondary text-foreground font-semibold shadow-2xs'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
    );

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-lg text-xs font-medium transition-all duration-150',
      isActive
        ? 'text-foreground font-semibold bg-secondary/80'
        : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
        {/* Navigation */}
        <header className="bg-card/85 backdrop-blur-md border-b border-border sticky top-0 z-40 transition-colors duration-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link to="/" className="flex items-center gap-2 group">
                  <img src={logo} alt="LearnWords" className="h-8 w-auto dark:hidden transition-transform duration-200 group-hover:scale-102" />
                  <img src={logoDark} alt="LearnWords" className="h-8 w-auto hidden dark:block transition-transform duration-200 group-hover:scale-102" />
                </Link>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1 sm:gap-2">
                <NavLink to="/" end className={navLinkClass}>
                  <HomeIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Home</span>
                </NavLink>
                <NavLink to="/words" className={navLinkClass}>
                  <BookOpen className="h-4 w-4" />
                  <span className="hidden sm:inline">Words</span>
                </NavLink>
                <NavLink to="/study" className={navLinkClass}>
                  <GraduationCap className="h-4 w-4" />
                  <span className="hidden sm:inline">Study</span>
                </NavLink>
                <NavLink to="/statistics" className={navLinkClass}>
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Statistics</span>
                </NavLink>
                <NavLink to="/data" className={navLinkClass}>
                  <Database className="h-4 w-4" />
                  <span className="hidden sm:inline">Data</span>
                </NavLink>

                <div className="ml-1 sm:ml-2 pl-1 sm:pl-2 border-l border-border flex items-center">
                  <ThemeToggle />
                </div>
              </nav>

              {/* Mobile Header Right: Theme Toggle Only */}
              <div className="flex items-center md:hidden">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main
          className={cn(
            'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 md:py-6 pb-20 md:pb-6',
            isStudy && 'pb-0'
          )}
        >
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/home" element={<Home />} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/words" element={<Words />} />
              <Route path="/study" element={<Study />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/data" element={<DataManagement />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* Mobile Fixed Bottom Navigation Bar */}
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around py-2 px-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] md:hidden"
        >
          <NavLink to="/" end className={mobileNavLinkClass}>
            <HomeIcon className="h-5 w-5 mb-0.5" />
            <span className="text-[11px] leading-tight">Home</span>
          </NavLink>
          <NavLink to="/words" className={mobileNavLinkClass}>
            <BookOpen className="h-5 w-5 mb-0.5" />
            <span className="text-[11px] leading-tight">Words</span>
          </NavLink>
          <NavLink to="/study" className={mobileNavLinkClass}>
            <GraduationCap className="h-5 w-5 mb-0.5" />
            <span className="text-[11px] leading-tight">Study</span>
          </NavLink>
          <NavLink to="/statistics" className={mobileNavLinkClass}>
            <BarChart3 className="h-5 w-5 mb-0.5" />
            <span className="text-[11px] leading-tight">Statistics</span>
          </NavLink>
          <NavLink to="/data" className={mobileNavLinkClass}>
            <Database className="h-5 w-5 mb-0.5" />
            <span className="text-[11px] leading-tight">Data</span>
          </NavLink>
        </nav>
      </div>
    </ToastProvider>
  );
}

export default App;
