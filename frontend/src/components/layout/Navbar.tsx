import { Briefcase, MessageSquare, Home, Bell, UserMenu } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <div className="bg-blue-600 p-1.5 rounded text-white font-bold text-xl leading-none">
              in
            </div>
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Search jobs, profiles..."
                className="bg-slate-100 border-none rounded-md py-1.5 pl-4 pr-10 text-sm focus:ring-2 focus:ring-blue-600 focus:bg-white w-64"
              />
            </div>
          </div>

          <div className="flex items-center space-x-8">
            <Link to="/" className="flex flex-col items-center text-slate-500 hover:text-slate-900 transition-colors">
              <Home size={20} />
              <span className="text-xs font-medium mt-1">Home</span>
            </Link>
            <Link to="/jobs" className="flex flex-col items-center text-slate-500 hover:text-slate-900 transition-colors">
              <Briefcase size={20} />
              <span className="text-xs font-medium mt-1">Jobs</span>
            </Link>
            <Link to="/messaging" className="flex flex-col items-center text-slate-500 hover:text-slate-900 transition-colors">
              <MessageSquare size={20} />
              <span className="text-xs font-medium mt-1">Messaging</span>
            </Link>
            <button className="flex flex-col items-center text-slate-500 hover:text-slate-900 transition-colors">
              <Bell size={20} />
              <span className="text-xs font-medium mt-1">Notifications</span>
            </button>
            <Link to="/profile" className="flex flex-col items-center text-slate-500 hover:text-slate-900 transition-colors pl-4 border-l border-slate-200">
              <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center overflow-hidden">
                <span className="text-xs text-white font-bold">ME</span>
              </div>
              <span className="text-xs font-medium mt-1">Me</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
