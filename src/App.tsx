import { useState } from 'react';
import { Words } from './pages/Words';
import { Study } from './pages/Study';
import { Dashboard } from './pages/Dashboard';
import { Statistics } from './pages/Statistics';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'words':
        return <Words />;
      case 'study':
        return <Study />;
      case 'statistics':
        return <Statistics />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  const navLinkClass = (page: string) => `
    px-4 py-2 font-medium transition-colors
    ${currentPage === page 
      ? 'text-surface-900 border-b-2 border-surface-900' 
      : 'text-surface-500 hover:text-surface-900'
    }
  `;

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Navigation */}
      <nav className="bg-white border-b border-surface-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button 
                onClick={() => setCurrentPage('dashboard')}
                className="text-lg font-bold text-surface-900"
              >
                LearnWords
              </button>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button onClick={() => setCurrentPage('dashboard')} className={navLinkClass('dashboard')}>
                Dashboard
              </button>
              <button onClick={() => setCurrentPage('words')} className={navLinkClass('words')}>
                Words
              </button>
              <button onClick={() => setCurrentPage('study')} className={navLinkClass('study')}>
                Study
              </button>
              <button onClick={() => setCurrentPage('statistics')} className={navLinkClass('statistics')}>
                Statistics
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
