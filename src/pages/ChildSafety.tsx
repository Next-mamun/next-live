import React from 'react';
import { Shield, AlertTriangle, AlertCircle, FileText, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ChildSafety: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-black text-gray-900 dark:text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto bg-white dark:bg-[#1a1a1b] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 md:p-10 space-y-8">
        
        {/* Back Button */}
        <div>
          <button 
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-sm transition-colors"
          >
            <ArrowLeft size={16} /> Back to Settings
          </button>
        </div>

        {/* Header Section */}
        <div className="flex flex-col items-center text-center space-y-4 pb-6 border-b border-gray-200 dark:border-gray-800">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-600 dark:text-red-500" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Child Safety Standards & Anti-CSAE Policy</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated: August 24, 2026</p>
        </div>

        {/* Introduction */}
        <section className="space-y-4">
          <p className="text-base leading-relaxed">
            At Next, we are deeply committed to ensuring a safe, secure, and positive environment for all our users. 
            The safety of minors is our highest priority, and we strictly enforce policies to protect children from 
            all forms of exploitation and abuse.
          </p>
        </section>

        {/* Zero Tolerance Statement */}
        <section className="bg-red-50 dark:bg-red-950/20 border-l-4 border-red-500 p-5 rounded-r-lg space-y-3">
          <h2 className="text-xl font-bold flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="w-6 h-6" />
            Zero Tolerance for CSAM & CSAE
          </h2>
          <p className="text-sm md:text-base text-red-900 dark:text-red-200 leading-relaxed">
            We have a <strong>STRICT ZERO TOLERANCE POLICY</strong> regarding Child Sexual Abuse Material (CSAM) 
            and Child Sexual Abuse and Exploitation (CSAE). Any user found generating, uploading, sharing, or 
            soliciting such content will face immediate, permanent account termination without appeal.
          </p>
        </section>

        {/* Content Moderation & Community Guidelines */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#1877F2]" />
            Moderation & Community Guidelines
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-gray-700 dark:text-gray-300">
            <li><strong>Automated & Manual Review:</strong> We employ a combination of automated scanning technologies and human moderation to identify and remove policy-violating content.</li>
            <li><strong>Prohibited Content:</strong> Users are strictly forbidden from posting content that depicts, encourages, or normalizes the abuse, grooming, or exploitation of minors.</li>
            <li><strong>Age Restrictions:</strong> Our platform requires users to be of appropriate legal age as defined by regional laws to create an account.</li>
            <li><strong>Privacy Enforcement:</strong> Sharing personally identifiable information (PII) of minors is strictly prohibited and will be swiftly removed.</li>
          </ul>
        </section>

        {/* Reporting Unlawful Content */}
        <section className="bg-gray-50 dark:bg-[#272729] p-6 rounded-lg space-y-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-yellow-500" />
            How to Report Policy Violations
          </h2>
          <p className="text-base text-gray-700 dark:text-gray-300">
            If you encounter any content or behavior that violates this policy, it is imperative that you report it immediately. 
            We prioritize reports related to child safety above all other inquiries.
          </p>
          <div className="bg-white dark:bg-black p-4 rounded border border-gray-200 dark:border-gray-800">
             <p className="font-semibold mb-2">To report a violation:</p>
             <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-600 dark:text-gray-400">
               <li>Use the in-app reporting tools available on every post, profile, and message.</li>
               <li>Select the "Child Safety / CSAM" or equivalent high-priority option.</li>
               <li>Alternatively, email our dedicated trust and safety team directly.</li>
             </ol>
          </div>
        </section>

        {/* Compliance Declaration & Contact Info */}
        <section className="space-y-4 border-t border-gray-200 dark:border-gray-800 pt-6">
          <h2 className="text-xl font-bold">Compliance & Law Enforcement Declaration</h2>
          <p className="text-base leading-relaxed text-gray-700 dark:text-gray-300">
            We actively comply with all applicable local, national, and international laws regarding child safety. 
            When CSAM or suspected CSAE is identified on our platform, we will preserve the evidence and 
            report the offending users to the relevant regional authorities and organizations (such as NCMEC) as required by law.
          </p>
          
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Official Contact for Safety Inquiries:</h3>
            <p className="text-blue-800 dark:text-blue-200 font-medium text-lg">
              <a href="mailto:abdullahalmamun.next@gmail.com" className="hover:underline">abdullahalmamun.next@gmail.com</a>
            </p>
          </div>
        </section>
        
        {/* Footer Actions */}
        <div className="flex justify-center pt-8">
           <button 
             onClick={() => navigate('/settings')}
             className="px-6 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white font-bold rounded-xl transition-colors shadow-sm"
           >
             Back to Settings
           </button>
        </div>

      </div>
    </div>
  );
};

export default ChildSafety;
