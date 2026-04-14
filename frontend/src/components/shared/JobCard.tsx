import { Job } from '../../mockData/jobs';
import { MapPin, Briefcase, Clock, Building2 } from 'lucide-react';

interface JobCardProps {
  job: Job;
  isActive?: boolean;
  onClick: () => void;
}

export default function JobCard({ job, isActive, onClick }: JobCardProps) {
  return (
    <div 
      onClick={onClick}
      className={`p-4 border-b border-slate-200 cursor-pointer transition-all hover:bg-slate-50 ${
        isActive ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : 'bg-white border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className={`font-semibold text-lg ${isActive ? 'text-blue-700' : 'text-slate-900'} leading-tight`}>
          {job.title}
        </h3>
        <button className="text-slate-400 hover:text-blue-600">
          <Briefcase size={18} />
        </button>
      </div>
      
      <div className="flex items-center text-slate-700 text-sm mb-1.5 font-medium">
        <Building2 size={16} className="mr-1.5 text-slate-400" />
        {job.company}
      </div>
      
      <div className="flex items-center text-slate-500 text-sm mb-3">
        <MapPin size={16} className="mr-1.5 text-slate-400" />
        {job.location}
      </div>
      
      <div className="flex flex-wrap gap-2 mb-3">
        {job.skills.slice(0, 3).map((skill, idx) => (
          <span 
            key={idx}
            className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md border border-slate-200"
          >
            {skill}
          </span>
        ))}
        {job.skills.length > 3 && (
          <span className="px-2 py-1 bg-slate-50 text-slate-500 text-xs font-medium rounded-md">
            +{job.skills.length - 3} more
          </span>
        )}
      </div>

      <div className="flex items-center text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100 font-medium">
        <Clock size={14} className="mr-1 inline" />
        {job.postedAt} 
        <span className="mx-2">•</span> 
        {job.applicants ? `${job.applicants} applicants` : 'Be the first to apply'}
      </div>
    </div>
  );
}
