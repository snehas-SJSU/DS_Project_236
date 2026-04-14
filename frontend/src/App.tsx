import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import JobsBoard from './pages/JobsBoard';
import Profile from './pages/Profile';
import RecruiterDashboard from './pages/RecruiterDashboard';

function FeedPlaceholder() {
  return (
    <div className="max-w-3xl mx-auto mt-10 p-8 bg-white rounded-lg shadow-sm border border-slate-200 text-center">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Member Feed</h2>
      <p className="text-slate-500">Your network updates will appear here.</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <Navbar />
        <Routes>
          <Route path="/" element={<FeedPlaceholder />} />
          <Route path="/jobs" element={<JobsBoard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/recruiter" element={<RecruiterDashboard />} />
          <Route path="/messaging" element={<div className="p-8 text-center text-slate-500">Messaging implementation coming soon...</div>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
