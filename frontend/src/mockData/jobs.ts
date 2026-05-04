export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  type: string;
  postedAt: string;
  skills: string[];
  description: string;
  logoUrl?: string;
  applicants?: number;
  industry?: string;
  remote_mode?: string;
  seniority_level?: string;
  employment_type?: string;
  recruiter_id?: string;
  status?: string;
  /** Job listing views (from `jobs.views_count`). */
  views_count?: number;
}

export const MOCK_JOBS: Job[] = [
  {
    id: "J-1001",
    title: "Senior AI Engineer",
    company: "TechNova Corp",
    location: "San Francisco, CA (Hybrid)",
    salary: "$180k - $220k",
    type: "Full-time",
    postedAt: "2 hours ago",
    skills: ["Python", "FastAPI", "Kafka", "Machine Learning"],
    description: "We are looking for a Senior AI Engineer to help build our next-generation agentic AI pipeline. You will be responsible for orchestrating LLM agents using Kafka and FastAPI."
  },
  {
    id: "J-1002",
    title: "Full Stack Engineer",
    company: "Global Nexus",
    location: "Remote",
    salary: "$130k - $160k",
    type: "Full-time",
    postedAt: "1 day ago",
    skills: ["React", "Node.js", "MongoDB", "TailwindCSS"],
    description: "Join us to shape the future of digital connectivity. We need an experienced Full Stack Engineer who is deeply familiar with standard React and Node pipelines."
  },
  {
    id: "J-1003",
    title: "Data Scientist",
    company: "FinStream Analytics",
    location: "New York, NY",
    salary: "$150k - $190k",
    type: "Contract",
    postedAt: "3 days ago",
    skills: ["SQL", "Python", "Redis", "Data Modeling"],
    description: "FinStream is seeking a Data Scientist to analyze massive volumes of financial transaction data and build predictive models for fraud detection."
  }
];
