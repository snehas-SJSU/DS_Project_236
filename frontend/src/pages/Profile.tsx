import { useState, useEffect } from 'react';
import { Briefcase, GraduationCap, MapPin, Sparkles, Building2, ChevronDown } from 'lucide-react';

type LoadState = { status: 'loading' } | { status: 'ok'; data: any } | { status: 'error'; message: string };

export default function Profile() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    fetch('http://localhost:4000/api/members/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: 'M-123' })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404 || data.error === 'NOT_FOUND' || data.error === 'MEMBER_NOT_FOUND') {
            setState({
              status: 'error',
              message:
                'No profile for member M-123 yet. With Docker + Kafka + npm run start:all running, open a terminal in the repo root and run: npm run seed:member — wait a few seconds, then refresh this page.'
            });
            return;
          }
          setState({
            status: 'error',
            message:
              res.status === 504
                ? 'Gateway timeout (504). Usually member service (:4001) was not ready yet, or MySQL was slow to accept connections. Wait ~15s after `docker compose up`, restart `npm run start:all`, then refresh. If it persists, run `npm run seed:member` once the member worker is up.'
                : data.message || data.error || `API error (${res.status}). Check gateway :4000 and member service :4001.`
          });
          return;
        }
        if (data.error) {
          setState({ status: 'error', message: String(data.error) });
          return;
        }
        setState({ status: 'ok', data });
      })
      .catch(() => {
        setState({
          status: 'error',
          message:
            'Could not reach http://localhost:4000. Start the stack (npm run start:all from the repo root) and try again.'
        });
      });
  }, []);

  if (state.status === 'loading') return <div className="p-8 text-center">Loading profile...</div>;
  if (state.status === 'error') {
    return (
      <div className="max-w-xl mx-auto p-8 text-center text-red-600 space-y-3">
        <p className="font-medium">Profile could not be loaded</p>
        <p className="text-sm text-slate-700 whitespace-pre-wrap text-left bg-slate-50 border border-slate-200 rounded-lg p-4">{state.message}</p>
      </div>
    );
  }

  const profile = state.data;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Card: Identity */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-6 relative">
        <div className="h-32 bg-slate-200 absolute top-0 left-0 w-full z-0 overflow-hidden">
          <div className="w-full h-full bg-gradient-to-r from-blue-400 to-indigo-500 opacity-80" />
        </div>
        
        <div className="relative z-10 px-8 pt-16 pb-6">
          <div className="flex justify-between items-end">
            <div className="w-32 h-32 rounded-full border-4 border-white bg-slate-300 shadow-md flex items-center justify-center text-4xl font-bold text-white overflow-hidden">
              <img src={'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4'} alt="Avatar" />
            </div>
            <button className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium hover:bg-blue-700 transition shadow-sm mb-4">
              Edit Profile
            </button>
          </div>
          
          <div className="mt-4">
            <h1 className="text-3xl font-bold text-slate-900">{profile.name}</h1>
            <h2 className="text-lg text-slate-700 mt-1">{profile.title}</h2>
            <div className="flex items-center text-slate-500 text-sm mt-3 font-medium">
              <MapPin size={16} className="mr-1" /> {profile.location}
              <span className="mx-3">•</span>
              <span className="text-blue-600 font-bold hover:underline cursor-pointer">500+ Connections</span>
            </div>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4">About</h3>
        <p className="text-slate-700 leading-relaxed">
          {profile.about}
        </p>

        {/* AI Suggestions Box */}
        <div className="mt-6 border border-indigo-100 bg-indigo-50/50 rounded-lg p-5">
           <div className="flex items-center text-indigo-700 font-semibold mb-2">
             <Sparkles size={18} className="mr-2" /> AI Career Coach Suggestion
           </div>
           <p className="text-sm text-indigo-900/80 mb-3">
             Your profile is strong, but you can increase your visibility by adding specific metrics to your "About" section. For example: "Scaled event architectures processing 1M+ messages/day."
           </p>
           <button className="text-sm bg-white border border-indigo-200 text-indigo-700 px-4 py-1.5 rounded hover:bg-indigo-50 font-medium transition cursor-pointer">
             Apply Suggestion
           </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column (Wider): Experience & Education */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6">Experience</h3>
            
            {profile.experience.map((exp: any, idx: number) => (
              <div key={idx} className="relative pl-6 border-l-2 border-slate-200 mb-8 pb-2">
                <div className="absolute w-4 h-4 bg-blue-600 rounded-full -left-[9px] top-1 border-2 border-white shadow-sm"></div>
                <h4 className="font-bold text-lg text-slate-900 leading-tight">{exp.role}</h4>
                <div className="text-slate-600 font-medium mt-1">{exp.company} • Full-time</div>
                <div className="text-slate-500 text-sm mt-1 mb-3">{exp.period}</div>
                <p className="text-slate-700 leading-relaxed">
                  {exp.description}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6">Education</h3>
            {profile.education.map((edu: any, idx: number) => (
              <div key={idx} className="flex items-start mb-6 last:mb-0">
                <div className="p-3 bg-slate-100 rounded-lg mr-4">
                  <GraduationCap size={24} className="text-slate-500" />
                </div>
                <div>
                  <h4 className="font-bold text-lg text-slate-900">{edu.school}</h4>
                  <div className="text-slate-700 mt-1">{edu.degree}</div>
                  <div className="text-slate-500 text-sm mt-1">{edu.period}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Skills */}
        <div className="col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Top Skills</h3>
            <div className="flex flex-col gap-3">
              {profile.skills.map((skill: string, idx: number) => (
                <div key={idx} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="font-bold text-slate-800">{skill}</div>
                  <div className="text-sm text-slate-500 flex items-center mt-1">
                    <Building2 size={14} className="mr-1.5" /> {Math.floor(Math.random() * 10) + 1} endorsements
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 py-2 flex items-center justify-center text-slate-500 font-semibold text-sm hover:bg-slate-50 rounded transition">
              Show all skills <ChevronDown size={16} className="ml-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
