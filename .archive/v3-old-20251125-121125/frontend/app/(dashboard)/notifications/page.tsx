'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import api, { setAuthToken } from '@/lib/api';
import { Bell, Radar, Database, AlertCircle, CheckCircle, Info, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: 'battle' | 'ingestion' | 'alert' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  severity: 'info' | 'warning' | 'error' | 'success';
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && session) {
      setAuthToken((session as any).accessToken);
      fetchNotifications();
    }
  }, [status, session, router]);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications').catch(() => ({
        data: [
          {
            id: '1',
            type: 'battle',
            title: 'New Battle Detected',
            message: 'A large-scale battle has started in M-OEE8 system',
            timestamp: new Date(Date.now() - 300000).toISOString(),
            read: false,
            severity: 'info',
          },
          {
            id: '2',
            type: 'alert',
            title: 'High ISK Loss',
            message: 'A Titan was destroyed in 1DQ1-A, total loss: 85B ISK',
            timestamp: new Date(Date.now() - 600000).toISOString(),
            read: false,
            severity: 'warning',
          },
          {
            id: '3',
            type: 'ingestion',
            title: 'Ingestion Job Completed',
            message: 'Killmail ingestion job has successfully processed 5,000 records',
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            read: true,
            severity: 'success',
          },
          {
            id: '4',
            type: 'battle',
            title: 'Battle Ended',
            message: 'Battle in T5ZI-S has ended. Duration: 2.5 hours, Kills: 234',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            read: true,
            severity: 'info',
          },
          {
            id: '5',
            type: 'alert',
            title: 'Service Alert',
            message: 'Enrichment service experienced a temporary slowdown',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            read: true,
            severity: 'error',
          },
        ],
      }));
      setNotifications(response.data || []);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const filteredNotifications = notifications.filter(
    (n) => filter === 'all' || !n.read
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Notifications</h1>
          <p className="text-slate-400">
            Stay updated with battles, ingestion jobs, and system alerts
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            Mark All as Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'unread'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        {filteredNotifications.length > 0 ? (
          <div className="divide-y divide-slate-700">
            {filteredNotifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onMarkAsRead={() => markAsRead(notification.id)}
                onDelete={() => deleteNotification(notification.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationCard({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: Notification;
  onMarkAsRead: () => void;
  onDelete: () => void;
}) {
  const icons = {
    battle: Radar,
    ingestion: Database,
    alert: AlertCircle,
    info: Info,
  };

  const severityColors = {
    info: 'bg-blue-500/20 text-blue-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    error: 'bg-red-500/20 text-red-400',
    success: 'bg-green-500/20 text-green-400',
  };

  const Icon = icons[notification.type];

  return (
    <div
      className={`p-5 hover:bg-slate-700/50 transition-colors ${
        !notification.read ? 'bg-blue-500/5' : ''
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${severityColors[notification.severity]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-white font-semibold">{notification.title}</h3>
            {!notification.read && (
              <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
            )}
          </div>
          <p className="text-slate-400 text-sm mb-2">{notification.message}</p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">
              {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
            </span>
            {!notification.read && (
              <button
                onClick={onMarkAsRead}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                <CheckCircle className="w-3 h-3" />
                Mark as read
              </button>
            )}
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
