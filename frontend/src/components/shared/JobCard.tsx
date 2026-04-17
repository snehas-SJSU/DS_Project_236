import { Link, useNavigate } from 'react-router-dom';
import { Job } from '../../mockData/jobs';
import { MapPin, Briefcase, Clock, Building2 } from 'lucide-react';
import { companyProfilePath, jobsResultsPath } from '../../lib/jobRoutes';

interface JobCardProps {
  job: Job;
  isActive?: boolean;
}

export default function JobCard({ job, isActive }: JobCardProps) {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(jobsResultsPath(job.id))}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(jobsResultsPath(job.id));
        }
      }}
      className={`cursor-pointer border-b border-[#e0dfdc] p-3 transition-all hover:bg-[#f9fafb] ${
        isActive ? 'border-l-4 border-l-[#0a66c2] bg-[#eef3f8]' : 'border-l-4 border-l-transparent bg-white'
      }`}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3 className={`line-clamp-2 text-[18px] font-semibold leading-[1.15] ${isActive ? 'text-[#0a66c2]' : 'text-[#191919]'}`}>
          {job.title}
        </h3>
        <span className="text-slate-400 hover:text-[#0a66c2]">
          <Briefcase size={18} />
        </span>
      </div>
      
      <div className="mb-1 flex items-center text-sm font-medium text-[#444444]">
        <Building2 size={15} className="mr-1.5 text-slate-400" />
        <Link
          to={companyProfilePath(job.company)}
          onClick={(e) => e.stopPropagation()}
          className="hover:text-[#0a66c2] hover:underline"
        >
          {job.company}
        </Link>
      </div>
      
      <div className="mb-2.5 flex items-center text-sm text-[#666666]">
        <MapPin size={15} className="mr-1.5 text-slate-400" />
        {job.location}
      </div>
      
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {(job.skills || []).slice(0, 3).map((skill, idx) => (
          <span 
            key={idx}
            className="rounded-full border border-[#d0d7de] bg-white px-2 py-0.5 text-[11px] font-medium text-[#44546a]"
          >
            {skill}
          </span>
        ))}
        {(job.skills || []).length > 3 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            +{(job.skills || []).length - 3} more
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center border-t border-slate-100 pt-2 text-xs font-medium text-[#666666]">
        <Clock size={14} className="mr-1 inline" />
        {job.postedAt} 
        <span className="mx-2">•</span> 
        {job.applicants ? `${job.applicants} applicants` : 'Be the first to apply'}
      </div>
    </div>
  );
}
