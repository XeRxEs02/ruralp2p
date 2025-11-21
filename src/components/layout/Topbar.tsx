import { Bell, Wallet, LogOut, User, Settings, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { notificationApi } from "@/lib/api";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Notification {
  _id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  read: boolean;
}

export const Topbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [walletConnected, setWalletConnected] = useState(false);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      checkWalletConnection();
    }
  }, [user]);

  const fetchNotifications = async () => {
    try {
      if (!user?.id) {
        console.log('User not authenticated, skipping notification fetch');
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      console.log('Fetching notifications for user:', user.id);
      const response = await notificationApi.getUserNotifications(user.id);
      console.log('Notifications API response:', response);

      if (response.success && response.data) {
        const data = response.data as any;
        const notificationsData = Array.isArray(data.notifications) ? data.notifications :
                                 (data && Array.isArray(data.data)) ? data.data : [];
        setNotifications(notificationsData.slice(0, 5)); // Show latest 5
        setUnreadCount(data.unreadCount || 0);
      } else {
        console.log('No notifications data:', response);
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const checkWalletConnection = () => {
    // Check if user has wallet address (simulated connection check)
    const hasWallet = !!user?.walletAddress && user.walletAddress.trim() !== '';
    setWalletConnected(hasWallet);
  };

  const handleConnectWallet = async () => {
    if (walletConnected && user?.walletAddress) {
      // Show wallet details
      console.log('Wallet already connected:', user.walletAddress);
      toast.success(`Connected to wallet: ${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`);
    } else {
      // Simulate wallet connection
      try {
        console.log('Connecting wallet...');

        // In a real implementation, this would integrate with MetaMask or other wallet
        // For demo purposes, we'll simulate a successful connection
        const mockWalletAddress = '0x' + Math.random().toString(16).substr(2, 40);

        // Update user context with wallet address (in real app, this would be saved to backend)
        console.log('Mock wallet connected:', mockWalletAddress);
        setWalletConnected(true);
        toast.success('Wallet connected successfully!');

      } catch (error) {
        console.error('Wallet connection failed:', error);
        toast.error('Failed to connect wallet');
      }
    }
  };

  const handleNotificationClick = () => {
    navigate('/notifications');
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await notificationApi.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(notif =>
          notif._id === notificationId ? { ...notif, read: true } : notif
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const goToProfile = () => {
    navigate("/settings");
  };

  const goToNotifications = () => {
    navigate("/notifications");
  };

  return (
    <header className="h-16 glass-panel border-b border-glass-border px-6 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">
          Welcome back, {user?.fullName?.split(" ")[0]} ({user?.role})
        </h2>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          className={`gap-2 ${walletConnected ? 'border-green-500/50 text-green-400 hover:bg-green-500/20' : 'border-gold/50 text-gold hover:bg-gold/20'}`}
          onClick={handleConnectWallet}
        >
          <Wallet className="w-4 h-4" />
          <span className="font-mono text-sm">
            {walletConnected && user?.walletAddress
              ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
              : "Connect Wallet"}
          </span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 glass-panel border-glass-border"
          >
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <Button variant="ghost" size="sm" onClick={goToNotifications}>
                View All
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification._id}
                  className={`p-3 cursor-pointer ${!notification.read ? 'bg-gold/10' : ''}`}
                  onClick={() => markAsRead(notification._id)}
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{notification.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {notification.message}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(notification.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {!notification.read && (
                    <div className="w-2 h-2 bg-gold rounded-full ml-2" />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <User className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 glass-panel border-glass-border"
          >
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-gold font-medium">{user?.role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={goToProfile} className="cursor-pointer">
              <Settings className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={logout}
              className="text-destructive cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
