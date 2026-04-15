import { Link } from 'react-router-dom';

const topLinks = ['Top Content', 'People', 'Learning', 'Jobs', 'Games'];

const exploreBlocks = [
  {
    title: 'Explore top LinkedIn content',
    tags: ['See All Topics', 'Workplace Management', 'Business Marketing', 'Technology', 'Interviewing', 'Leadership']
  },
  {
    title: 'Find the right job or internship for you',
    tags: ['Engineering', 'Business Development', 'Finance', 'Administrative Assistant', 'Retail Associate', 'Customer Service']
  },
  {
    title: 'Discover the best software tools',
    tags: ['E-Commerce Platforms', 'CRM Software', 'Human Resources Management Systems', 'Recruiting Software', 'Sales Intelligence Software']
  },
  {
    title: 'Keep your mind sharp with games',
    tags: ['Pinpoint', 'Queens', 'Crossclimb', 'Zip', 'Tango']
  }
];

function Pill({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="rounded-full border border-[#d0d7de] px-3 py-1.5 text-xs font-semibold text-[#404040] transition-colors hover:border-[#9aa7b2] hover:bg-[#f3f6f8]"
    >
      {label}
    </button>
  );
}

export default function LoginLandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#191919]">
      <header className="mx-auto flex h-[76px] w-full max-w-[1128px] items-center justify-between px-4">
        <Link to="/login" className="text-4xl font-bold text-[#0a66c2]">
          in
        </Link>
        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-4 md:flex">
            {topLinks.map((item) => (
              <Link key={item} to="/feed" className="text-xs font-medium text-[#666666] hover:text-[#191919]">
                {item}
              </Link>
            ))}
          </nav>
          <Link
            to="/login/email"
            className="rounded-full border border-[#0a66c2] px-4 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-[#eef3f8]"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-full bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
          >
            Join now
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-[1128px] grid-cols-1 items-center gap-8 px-4 py-8 md:grid-cols-2 md:py-12">
          <div>
            <h1 className="text-5xl font-light leading-tight text-[#8f5849]">Discover new opportunities</h1>
            <div className="mt-8 space-y-3">
              <button type="button" className="w-full rounded-full bg-[#0a66c2] px-4 py-3 text-sm font-semibold text-white hover:bg-[#004182]">
                Continue with Google
              </button>
              <Link to="/login/email" className="block w-full rounded-full border border-[#6f6f6f] px-4 py-3 text-center text-sm font-semibold hover:bg-[#f3f6f8]">
                Sign in with email
              </Link>
              <p className="text-xs text-[#666666]">
                By clicking Continue to join or sign in, you agree to the Terms, Privacy Policy, and Cookie Policy.
              </p>
            </div>
            <p className="mt-6 text-base">
              New to LinkedIn? <Link to="/signup" className="font-semibold text-[#0a66c2] hover:underline">Join now</Link>
            </p>
          </div>
          <div className="flex justify-center">
            <img
              src="https://static.licdn.com/aero-v1/sc/h/dxf91zhqd2z6b0bwg85ktm5s4"
              alt="LinkedIn style welcome illustration"
              className="h-auto w-full max-w-[700px]"
            />
          </div>
        </section>

        <section className="border-t border-[#e8e8e8] bg-[#f4f2ee] py-12">
          <div className="mx-auto w-full max-w-[1128px] space-y-10 px-4">
            {exploreBlocks.map((block) => (
              <div key={block.title} className="grid gap-5 md:grid-cols-[320px_1fr]">
                <h2 className="text-3xl font-light leading-tight">{block.title}</h2>
                <div className="flex flex-wrap gap-2">
                  {block.tags.map((tag) => (
                    <Pill key={tag} label={tag} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-[1128px] grid-cols-1 items-center gap-8 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-4xl font-light leading-tight text-[#b24020]">Let the right people know you are open to work</h2>
            <p className="mt-3 text-sm text-[#666666]">
              With the Open to Work feature, you can privately tell recruiters or publicly share with the LinkedIn community that you are looking for new opportunities.
            </p>
          </div>
          <div className="flex justify-center">
            <img
              src="https://static.licdn.com/aero-v1/sc/h/dbvmk0tsk0o0hd59fi64z3own"
              alt="Open to work visual"
              className="h-auto w-full max-w-[540px]"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

