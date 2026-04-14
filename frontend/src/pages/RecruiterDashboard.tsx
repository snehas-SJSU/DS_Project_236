import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, MousePointerClick, BookmarkCheck, TrendingUp } from 'lucide-react';

const mockBarData = [
  { name: 'Senior AI Eng', applications: 240 },
  { name: 'Full Stack', applications: 180 },
  { name: 'Data Scientist', applications: 154 },
  { name: 'DevOps', applications: 92 },
  { name: 'Product Mgr', applications: 210 }
];

const mockPieData = [
  { name: 'San Jose', value: 400 },
  { name: 'Remote', value: 300 },
  { name: 'New York', value: 300 },
  { name: 'Seattle', value: 200 },
];

const COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD'];

export default function RecruiterDashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recruiter Analytics</h1>
          <p className="text-slate-500">Track application metrics and job tracking performance.</p>
        </div>
        <select className="bg-white border border-slate-300 text-slate-700 rounded-md px-4 py-2 shadow-sm font-medium focus:ring-blue-500 focus:border-blue-500">
          <option>Last 30 Days</option>
          <option>Last 7 Days</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {[
          { title: 'Total Applications', value: '1,284', trend: '+12%', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
          { title: 'Job Clicks', value: '8,492', trend: '+24%', icon: MousePointerClick, color: 'text-indigo-600', bg: 'bg-indigo-100' },
          { title: 'Saved Jobs', value: '942', trend: '-2%', icon: BookmarkCheck, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { title: 'Application Rate', value: '15.1%', trend: '+4%', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-100' }
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-lg ${kpi.bg}`}>
                <kpi.icon size={24} className={kpi.color} />
              </div>
              <span className={`text-sm font-bold ${kpi.trend.startsWith('+') ? 'text-green-600' : 'text-red-500'}`}>
                {kpi.trend}
              </span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">{kpi.title}</h3>
            <div className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Bar Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="font-bold text-lg text-slate-800 mb-6">Top Jobs by Applications</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockBarData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} />
                <RechartsTooltip cursor={{fill: '#F1F5F9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="applications" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="font-bold text-lg text-slate-800 mb-6">Applications by City (Senior AI Eng)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mockPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {mockPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {mockPieData.map((entry, idx) => (
              <div key={idx} className="flex items-center text-xs text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: COLORS[idx % COLORS.length]}}></span>
                {entry.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
