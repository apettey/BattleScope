'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import api from '@/lib/api';
import { ArrowLeft, Save } from 'lucide-react';

interface SystemConfig {
  allowed_corps?: number[];
  allowed_alliances?: number[];
  denied_corps?: number[];
  denied_alliances?: number[];
  max_battle_age_hours?: number;
  min_killmail_value?: number;
}

export default function AdminConfigPage() {
  const [config, setConfig] = useState<SystemConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await api.get('/api/admin/config');
      setConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put('/api/admin/config', config);
      alert('Configuration saved successfully');
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSpinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </div>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">System Configuration</h1>
            <p className="text-gray-400 mt-1">
              Configure system settings and access control
            </p>
          </div>
          <Button onClick={handleSave} isLoading={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>

        <div className="space-y-6">
          <Card title="Access Control">
            <div className="space-y-4">
              <Input
                label="Allowed Corporations (comma-separated IDs)"
                placeholder="123456, 789012, ..."
                value={config.allowed_corps?.join(', ') || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    allowed_corps: e.target.value
                      .split(',')
                      .map((id) => parseInt(id.trim()))
                      .filter((id) => !isNaN(id)),
                  })
                }
                helperText="Only members of these corporations can access the system"
              />
              <Input
                label="Allowed Alliances (comma-separated IDs)"
                placeholder="123456, 789012, ..."
                value={config.allowed_alliances?.join(', ') || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    allowed_alliances: e.target.value
                      .split(',')
                      .map((id) => parseInt(id.trim()))
                      .filter((id) => !isNaN(id)),
                  })
                }
                helperText="Only members of these alliances can access the system"
              />
              <Input
                label="Denied Corporations (comma-separated IDs)"
                placeholder="123456, 789012, ..."
                value={config.denied_corps?.join(', ') || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    denied_corps: e.target.value
                      .split(',')
                      .map((id) => parseInt(id.trim()))
                      .filter((id) => !isNaN(id)),
                  })
                }
                helperText="Block specific corporations from accessing the system"
              />
              <Input
                label="Denied Alliances (comma-separated IDs)"
                placeholder="123456, 789012, ..."
                value={config.denied_alliances?.join(', ') || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    denied_alliances: e.target.value
                      .split(',')
                      .map((id) => parseInt(id.trim()))
                      .filter((id) => !isNaN(id)),
                  })
                }
                helperText="Block specific alliances from accessing the system"
              />
            </div>
          </Card>

          <Card title="Battle Settings">
            <div className="space-y-4">
              <Input
                type="number"
                label="Max Battle Age (hours)"
                placeholder="24"
                value={config.max_battle_age_hours || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    max_battle_age_hours: parseInt(e.target.value),
                  })
                }
                helperText="Maximum age of battles to display in hours"
              />
              <Input
                type="number"
                label="Min Killmail Value (ISK)"
                placeholder="1000000"
                value={config.min_killmail_value || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    min_killmail_value: parseInt(e.target.value),
                  })
                }
                helperText="Minimum ISK value for killmails to be processed"
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
