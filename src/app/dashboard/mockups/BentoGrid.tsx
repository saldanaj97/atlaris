import React from 'react';

export default function BentoGrid() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans text-gray-900 md:p-8">
      {/* Navigation */}
      <nav className="mx-auto mb-8 flex max-w-7xl items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-black"></div>
          <span className="text-xl font-bold tracking-tight">Atlaris</span>
        </div>
        <div className="hidden items-center gap-6 text-sm font-medium text-gray-500 md:flex">
          <a href="#" className="transition-colors hover:text-black">
            Product
          </a>
          <a href="#" className="transition-colors hover:text-black">
            Solutions
          </a>
          <a href="#" className="transition-colors hover:text-black">
            Resources
          </a>
          <a href="#" className="transition-colors hover:text-black">
            Pricing
          </a>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-black">
            Log in
          </button>
          <button className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800">
            Sign up
          </button>
        </div>
      </nav>

      {/* Hero Grid */}
      <main className="mx-auto grid h-auto max-w-7xl grid-cols-1 gap-4 md:h-[800px] md:grid-cols-4 md:grid-rows-3">
        {/* Main Value Prop - Large Square */}
        <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-white p-8 shadow-sm transition-shadow hover:shadow-md md:col-span-2 md:row-span-2">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
              <span className="h-2 w-2 rounded-full bg-orange-500"></span>
              New Feature
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
              Organize your work, <br />
              <span className="text-gray-400">effortlessly.</span>
            </h1>
            <p className="mb-8 max-w-md text-lg text-gray-500">
              The all-in-one workspace that adapts to your team's unique
              workflow.
            </p>
            <button className="rounded-xl bg-black px-6 py-3 font-medium text-white transition-colors hover:bg-gray-800">
              Get Started Free
            </button>
          </div>
          <div className="absolute right-0 bottom-0 h-64 w-64 rounded-tl-full bg-gradient-to-tl from-gray-100 to-transparent opacity-50 transition-transform duration-500 group-hover:scale-110"></div>
        </div>

        {/* Feature 1 - Tall Vertical */}
        <div className="group relative flex flex-col overflow-hidden rounded-3xl bg-[#F3F4F6] p-6 transition-shadow hover:shadow-md md:col-span-1 md:row-span-2">
          <div className="mb-auto">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
              <svg
                className="h-5 w-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                ></path>
              </svg>
            </div>
            <h3 className="mb-2 text-xl font-bold">Lightning Fast</h3>
            <p className="text-sm text-gray-500">
              Built on the edge for instant interactions.
            </p>
          </div>
          <div className="mt-8 translate-y-4 transform rounded-xl bg-white p-4 shadow-sm transition-transform group-hover:translate-y-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="h-2 w-12 rounded bg-gray-200"></div>
              <div className="h-2 w-8 rounded bg-green-100"></div>
            </div>
            <div className="mb-2 h-2 w-full rounded bg-gray-100"></div>
            <div className="h-2 w-3/4 rounded bg-gray-100"></div>
          </div>
        </div>

        {/* Feature 2 - Wide Horizontal */}
        <div className="group flex flex-col justify-between rounded-3xl bg-blue-600 p-6 text-white transition-shadow hover:shadow-md md:col-span-1 md:row-span-1">
          <div>
            <h3 className="mb-1 text-2xl font-bold">2.5x</h3>
            <p className="text-sm text-blue-100">Productivity Boost</p>
          </div>
          <div className="mt-4 flex -space-x-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-8 w-8 rounded-full border-2 border-blue-600 bg-blue-400"
              ></div>
            ))}
          </div>
        </div>

        {/* Feature 3 - Small Square */}
        <div className="group flex flex-col items-center justify-center rounded-3xl bg-white p-6 text-center transition-shadow hover:shadow-md md:col-span-1 md:row-span-1">
          <div className="mb-2 text-4xl transition-transform group-hover:scale-110">
            🔒
          </div>
          <h3 className="font-bold">Enterprise Ready</h3>
        </div>

        {/* Social Proof - Wide Horizontal */}
        <div className="group flex items-center justify-between rounded-3xl bg-[#111] p-8 text-white transition-shadow hover:shadow-md md:col-span-2 md:row-span-1">
          <div>
            <h3 className="mb-2 text-xl font-bold">Trusted by the best</h3>
            <div className="flex gap-4 opacity-50">
              <div className="h-6 w-20 rounded bg-white/20"></div>
              <div className="h-6 w-20 rounded bg-white/20"></div>
              <div className="h-6 w-20 rounded bg-white/20"></div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-green-400">99%</div>
            <div className="text-sm text-gray-400">Customer Satisfaction</div>
          </div>
        </div>

        {/* CTA - Medium */}
        <div className="group relative flex items-center justify-between overflow-hidden rounded-3xl bg-gradient-to-r from-purple-500 to-pink-500 p-8 text-white transition-shadow hover:shadow-md md:col-span-2 md:row-span-1">
          <div className="relative z-10">
            <h3 className="mb-2 text-2xl font-bold">Ready to dive in?</h3>
            <p className="mb-4 text-white/80">
              Start your 14-day free trial today.
            </p>
            <button className="hover:bg-opacity-90 rounded-lg bg-white px-5 py-2 text-sm font-bold text-purple-600 transition-colors">
              Get Started
            </button>
          </div>
          <div className="absolute top-0 right-0 h-full w-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        </div>
      </main>

      {/* Footer Grid */}
      <footer className="mx-auto mt-4 grid max-w-7xl grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500">
          © 2024 Atlaris Inc.
        </div>
        <div className="cursor-pointer rounded-2xl bg-white p-6 text-center transition-colors hover:bg-gray-50">
          Twitter
        </div>
        <div className="cursor-pointer rounded-2xl bg-white p-6 text-center transition-colors hover:bg-gray-50">
          LinkedIn
        </div>
        <div className="cursor-pointer rounded-2xl bg-white p-6 text-center transition-colors hover:bg-gray-50">
          Instagram
        </div>
      </footer>
    </div>
  );
}
