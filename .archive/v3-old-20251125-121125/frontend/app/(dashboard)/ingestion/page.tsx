'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import api, { setAuthToken } from '@/lib/api';
import { Database, Play, Pause, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

interface IngestionJob {
  id: string;
  type: 'killmail' | 'character' | 'corporation';
  status: 'running' | 'paused' | 'stopped' | 'error';
  itemsProcessed: number;
  itemsTotal: number;
  startedAt: string;
  lastUpdate: string;
  error?: string;
}

export default function IngestionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>('killmail');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && session) {
      setAuthToken((session as any).accessToken);
      fetchJobs();
    }
  }, [status, session, router]);

  const fetchJobs = async () => {
    try {
      const response = await api.get('/ingestion/jobs').catch(() => ({ data: [] }));
      setJobs(response.data || [
        {
          id: '1',
          type: 'killmail',
          status: 'running',
          itemsProcessed: 1234,
          itemsTotal: 5000,
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          lastUpdate: new Date().toISOString(),
        },
        {
          id: '2',
          type: 'character',
          status: 'running',
          itemsProcessed: 456,
          itemsTotal: 1000,
          startedAt: new Date(Date.now() - 7200000).toISOString(),
          lastUpdate: new Date().toISOString(),
        },
        {
          id: '3',
          type: 'corporation',
          status: 'paused',
          itemsProcessed: 89,
          itemsTotal: 200,
          startedAt: new Date(Date.now() - 10800000).toISOString(),
          lastUpdate: new Date(Date.now() - 1800000).toISOString(),
        },
      ]);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const startJob = async (type: string) => {
    try {
      await api.post('/ingestion/start', { type });
      fetchJobs();
    } catch (error) {
      console.error('Failed to start job:', error);
    }
  };

  const pauseJob = async (jobId: string) => {
    try {
      await api.post(`/ingestion/pause/${jobId}`);
      fetchJobs();
    } catch (error) {
      console.error('Failed to pause job:', error);
    }
  };

  const resumeJob = async (jobId: string) => {
    try {
      await api.post(`/ingestion/resume/${jobId}`);
      fetchJobs();
    } catch (error) {
      console.error('Failed to resume job:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">Loading ingestion data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Ingestion Management</h1>
        <p className="text-slate-400">Manage data ingestion jobs and monitor progress</p>
      </div>

      {/* Start New Job */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Play className="w-5 h-5 text-blue-400" />
          Start New Ingestion Job
        </h2>
        <div className="flex gap-4">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="killmail">Killmail Ingestion</option>
            <option value="character">Character Ingestion</option>
            <option value="corporation">Corporation Ingestion</option>
          </select>
          <button
            onClick={() => startJob(selectedType)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start Job
          </button>
        </div>
      </div>

      {/* Active Jobs */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-400" />
          Active Jobs
        </h2>
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onPause={() => pauseJob(job.id)}
              onResume={() => resumeJob(job.id)}
            />
          ))}
          {jobs.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              No active ingestion jobs. Start a new job above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobCard({
  job,
  onPause,
  onResume,
}: {
  job: IngestionJob;
  onPause: () => void;
  onResume: () => void;
}) {
  const progress = (job.itemsProcessed / job.itemsTotal) * 100;
  const statusColors = {
    running: 'bg-green-500/20 text-green-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    stopped: 'bg-gray-500/20 text-gray-400',
    error: 'bg-red-500/20 text-red-400',
  };

  const statusIcons = {
    running: CheckCircle,
    paused: Clock,
    stopped: XCircle,
    error: XCircle,
  };

  const StatusIcon = statusIcons[job.status];

  return (
    <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-white font-medium capitalize">{job.type} Ingestion</h3>
          <span className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 ${statusColors[job.status]}`}>
            <StatusIcon className="w-3 h-3" />
            {job.status}
          </span>
        </div>
        <div className="flex gap-2">
          {job.status === 'running' ? (
            <button
              onClick={onPause}
              className="p-2 hover:bg-slate-600 rounded transition-colors"
              title="Pause"
            >
              <Pause className="w-4 h-4 text-slate-300" />
            </button>
          ) : job.status === 'paused' ? (
            <button
              onClick={onResume}
              className="p-2 hover:bg-slate-600 rounded transition-colors"
              title="Resume"
            >
              <Play className="w-4 h-4 text-slate-300" />
            </button>
          ) : null}
          <button
            className="p-2 hover:bg-slate-600 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-sm text-slate-400 mb-1">
          <span>Progress</span>
          <span>
            {job.itemsProcessed.toLocaleString()} / {job.itemsTotal.toLocaleString()} ({progress.toFixed(1)}%)
          </span>
        </div>
        <div className="w-full bg-slate-600 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Timestamps */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-slate-400">Started:</span>
          <span className="text-white ml-2">
            {new Date(job.startedAt).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-slate-400">Last Update:</span>
          <span className="text-white ml-2">
            {new Date(job.lastUpdate).toLocaleString()}
          </span>
        </div>
      </div>

      {job.error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
          {job.error}
        </div>
      )}
    </div>
  );
}
