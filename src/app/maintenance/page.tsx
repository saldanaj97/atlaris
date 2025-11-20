import { ShieldAlert } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 md:p-12">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-5 animate-pulse">
            <ShieldAlert className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-900 px-4 py-2 rounded-full text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            System Maintenance in Progress
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
          We're Currently Under Maintenance
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-center text-gray-600 mb-8">
          Our platform is temporarily unavailable while we perform important
          updates and improvements.
        </p>

        {/* Message Box */}
        <div className="bg-gray-50 border-l-4 border-purple-600 rounded-lg p-6 space-y-4 mb-8">
          <p className="text-gray-700 leading-relaxed">
            We sincerely apologize for any inconvenience this may cause. Our
            team is actively working on critical fixes and system enhancements
            to improve your experience.
          </p>
          <p className="text-gray-700 leading-relaxed">
            <span className="text-purple-600 font-semibold">Good news:</span>{" "}
            We're in the process of migrating to a zero-downtime
            infrastructure. Once complete, future updates will occur seamlessly
            without interrupting your service.
          </p>
          <p className="text-gray-700 leading-relaxed">
            We appreciate your patience and understanding as we work to make
            Atlaris better for you.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center pt-6 border-t border-gray-200">
          <p className="text-gray-500 text-sm mb-2">
            Expected to be back online shortly
          </p>
          <p className="text-gray-500 text-sm">
            If you have urgent questions, please contact our support team
          </p>
        </div>
      </div>
    </div>
  );
}
