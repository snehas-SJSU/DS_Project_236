import { useState, useEffect } from 'react';
import { Job } from '../mockData/jobs';
import JobCard from '../components/shared/JobCard';
import { Sparkles, FileText, CheckCircle2 } from 'lucide-react';

export default function JobsBoard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:4000/api/jobs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setJobs(data);
          if (data.length > 0) setActiveJob(data[0]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch jobs:', err);
        setLoading(false);
      });
  }, []);

  const handleApply = async () => {
    if (!activeJob) return;
    setIsApplying(true);
    try {
      const response = await fetch('http://localhost:4000/api/applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeJob.id,
          member_id: 'M-123'
        })
      });
      
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        alert('Application submitted successfully!');
      } else {
        const msg = data.error === 'JOB_CLOSED'
          ? 'This job is closed — applications are not accepted.'
          : data.error === 'DUPLICATE_APPLICATION'
            ? 'You have already applied to this job.'
            : data.message || 'Failed to submit application.';
        alert(msg);
      }
    } catch (error) {
      console.error('Apply error:', error);
      alert('Error connecting to the application service.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-4rem)]">
      <div className="flex gap-6 h-full">
        {/* Left Column: Job List */}
        <div className="w-1/3 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center z-10 sticky top-0">
            <h2 className="font-semibold text-slate-800">Recommended Jobs</h2>
            <span className="text-xs text-blue-600 font-medium bg-blue-100 px-2 py-1 rounded-full">New items</span>
          </div>
          <div className="overflow-y-auto flex-1 pb-4">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading live jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No jobs in the database yet. Post one via Swagger!</div>
            ) : (
              jobs.map((job) => (
                <JobCard 
                  key={job.id} 
                  job={job} 
                  isActive={activeJob?.id === job.id} 
                  onClick={() => setActiveJob(job)} 
                />
              ))
            )}
          </div>
        </div>

        {/* Right Column: Job Detail & Copilot */}
        <div className="flex-1 right-column-scroll overflow-y-auto h-full flex flex-col gap-6">
          
          {activeJob ? (
            <>
              {/* Main Job Details */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">{activeJob.title}</h1>
                    <div className="text-lg text-slate-700">{activeJob.company} • {activeJob.location}</div>
                    <div className="text-sm text-slate-500 mt-2 font-medium">
                      {activeJob.type} • {activeJob.salary} • {activeJob.postedAt}
                    </div>
                  </div>
              <button 
                onClick={handleApply}
                disabled={isApplying}
                className="bg-blue-600 text-white px-8 py-2.5 rounded-full font-semibold hover:bg-blue-700 transition shadow-sm disabled:opacity-70 flex items-center justify-center min-w-[120px]"
              >
                {isApplying ? 'Sending...' : 'Easy Apply'}
              </button>
            </div>

            <hr className="border-slate-100 mb-6" />
            
            <h3 className="font-semibold text-lg mb-3">About the role</h3>
            <p className="text-slate-700 leading-relaxed max-w-3xl">
              {activeJob.description}
            </p>
          </div>

          {/* AI Copilot Widget */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg shadow-sm border border-indigo-100 p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-indigo-600 rounded-md shadow-sm">
                <Sparkles size={18} className="text-white" />
              </div>
              <h3 className="font-semibold text-indigo-900">Career Coach AI</h3>
            </div>
            
            <div className="bg-white rounded-md p-4 border border-indigo-50 shadow-sm text-sm text-slate-700 leading-relaxed mb-4">
              <span className="font-semibold text-indigo-700 mr-2">Quick analysis:</span>
              Based on your profile, you have an <strong className="text-green-600">85% match</strong> for this position. Your experiences with <span className="bg-slate-100 px-1 rounded">React</span> and <span className="bg-slate-100 px-1 rounded">FastAPI</span> align perfectly. However, you might want to highlight your <span className="bg-slate-100 px-1 rounded">Kafka</span> experience more prominently in your headline before applying.
            </div>

              <div className="flex gap-3">
                <button className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 px-4 py-2 rounded-full hover:bg-indigo-50 transition">
                  <FileText size={16} /> Look at my resume
                </button>
                <button className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-full hover:bg-slate-50 transition">
                  <CheckCircle2 size={16} /> Help me draft an outreach message
                </button>
              </div>
            </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">
              Select a job to view details
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
