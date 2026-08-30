"use client";

import { useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MoreVertical,
  Copy,
  Check,
  Download,
  Star,
  RefreshCw,
  Eye,
  Edit3,
  UserX,
  UserCheck,
  Mail,
  Phone,
  Wallet,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export type UserRole = "admin" | "moderator" | "seller" | "buyer";
export type UserStatus = "active" | "pending" | "suspended" | "flagged";

export interface ManagedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  kycVerified: boolean;
  walletAddress: string;
  fullWalletAddress: string;
  escrowsCount: number;
  completedVolume: string;
  reputationScore: number;
  totalReviews: number;
  joinedDate: string;
  avatarUrl?: string;
}

const INITIAL_USERS: ManagedUser[] = [
  {
    id: "usr_stb_001",
    firstName: "Sarah",
    lastName: "Connor",
    email: "sarah.c@truestub.io",
    phoneNumber: "+1 (555) 234-5678",
    role: "admin",
    status: "active",
    kycVerified: true,
    walletAddress: "GDQP...4X9Z",
    fullWalletAddress: "GDQP2LMKABCDEF1234567890MNOPQRSTUVWXYZ12345678904X9Z",
    escrowsCount: 48,
    completedVolume: "$24,500 USDC",
    reputationScore: 5.0,
    totalReviews: 42,
    joinedDate: "2025-11-12",
  },
  {
    id: "usr_stb_002",
    firstName: "John",
    lastName: "Smith",
    email: "john.smith@gmail.com",
    phoneNumber: "+506 6489 5321",
    role: "seller",
    status: "active",
    kycVerified: true,
    walletAddress: "GASK...XN32",
    fullWalletAddress: "GASKQBX7ABCDEF1234567890MNOPQRSTUVWXYZ1234567890XN32",
    escrowsCount: 32,
    completedVolume: "$12,800 USDC",
    reputationScore: 4.9,
    totalReviews: 29,
    joinedDate: "2026-01-08",
  },
  {
    id: "usr_stb_003",
    firstName: "Elena",
    lastName: "Rostova",
    email: "elena.r@blockchain-tickets.com",
    phoneNumber: "+44 20 7946 0912",
    role: "seller",
    status: "active",
    kycVerified: true,
    walletAddress: "GBLM...9Y2A",
    fullWalletAddress: "GBLM9876543210ABCDEF1234567890MNOPQRSTUVWXYZ9Y2A",
    escrowsCount: 65,
    completedVolume: "$38,200 USDC",
    reputationScore: 4.8,
    totalReviews: 57,
    joinedDate: "2025-12-03",
  },
  {
    id: "usr_stb_004",
    firstName: "Marcus",
    lastName: "Vance",
    email: "marcus.vance@cryptoevents.org",
    phoneNumber: "+1 (555) 876-5432",
    role: "moderator",
    status: "active",
    kycVerified: true,
    walletAddress: "GCKX...7W1B",
    fullWalletAddress: "GCKX112233445566778899AABBCCDDEEFF00112233447W1B",
    escrowsCount: 19,
    completedVolume: "$8,900 USDC",
    reputationScore: 4.9,
    totalReviews: 18,
    joinedDate: "2026-01-19",
  },
  {
    id: "usr_stb_005",
    firstName: "Amara",
    lastName: "Diallo",
    email: "amara.d@stubfan.net",
    phoneNumber: "+33 1 42 68 55 00",
    role: "buyer",
    status: "active",
    kycVerified: true,
    walletAddress: "GBVF...3T8K",
    fullWalletAddress: "GBVF887766554433221100FFEEDDCCBBAA99887766553T8K",
    escrowsCount: 12,
    completedVolume: "$3,400 USDC",
    reputationScore: 4.7,
    totalReviews: 11,
    joinedDate: "2026-02-02",
  },
  {
    id: "usr_stb_006",
    firstName: "Liam",
    lastName: "Chen",
    email: "liam.chen@techfest.io",
    phoneNumber: "+65 6789 0123",
    role: "buyer",
    status: "pending",
    kycVerified: false,
    walletAddress: "GAZX...6M4P",
    fullWalletAddress: "GAZX55443322110099887766554433221100998877666M4P",
    escrowsCount: 2,
    completedVolume: "$450 USDC",
    reputationScore: 4.2,
    totalReviews: 2,
    joinedDate: "2026-02-21",
  },
  {
    id: "usr_stb_007",
    firstName: "Victor",
    lastName: "Novak",
    email: "v.novak@suspicious-domain.cc",
    phoneNumber: "+7 495 123-45-67",
    role: "seller",
    status: "flagged",
    kycVerified: false,
    walletAddress: "GC99...1L88",
    fullWalletAddress: "GC9900112233445566778899AABBCCDDEEFF001122331L88",
    escrowsCount: 4,
    completedVolume: "$1,100 USDC",
    reputationScore: 2.1,
    totalReviews: 5,
    joinedDate: "2026-02-14",
  },
  {
    id: "usr_stb_008",
    firstName: "Dmitri",
    lastName: "Kozlov",
    email: "dmitri.k@banned-tickets.ru",
    phoneNumber: "+7 812 987-65-43",
    role: "buyer",
    status: "suspended",
    kycVerified: false,
    walletAddress: "GD88...5Q11",
    fullWalletAddress: "GD8811223344556677889900AABBCCDDEEFF112233445Q11",
    escrowsCount: 1,
    completedVolume: "$200 USDC",
    reputationScore: 1.0,
    totalReviews: 3,
    joinedDate: "2026-01-25",
  },
];

export default function UsersManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>(INITIAL_USERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kycFilter, setKycFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<keyof ManagedUser>("joinedDate");
  const [sortAsc, setSortAsc] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [editingRoleUser, setEditingRoleUser] = useState<ManagedUser | null>(null);
  const [newRoleValue, setNewRoleValue] = useState<UserRole>("buyer");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // New User Form State
  const [newUserForm, setNewUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    role: "buyer" as UserRole,
    walletAddress: "",
    kycVerified: false,
  });

  // Copy handler
  const handleCopy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      toast.success("Wallet address copied to clipboard");
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch {
      toast.error("Failed to copy address");
    }
  };

  // Toggle user status (suspend / activate)
  const handleToggleStatus = (user: ManagedUser) => {
    const nextStatus: UserStatus =
      user.status === "suspended" || user.status === "flagged"
        ? "active"
        : "suspended";
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
    );
    toast.success(
      `User ${user.firstName} ${user.lastName} is now ${nextStatus}`
    );
  };

  // Save role edit
  const handleSaveRole = () => {
    if (!editingRoleUser) return;
    setUsers((prev) =>
      prev.map((u) =>
        u.id === editingRoleUser.id ? { ...u, role: newRoleValue } : u
      )
    );
    toast.success(
      `Role for ${editingRoleUser.firstName} ${editingRoleUser.lastName} updated to ${newRoleValue}`
    );
    setEditingRoleUser(null);
  };

  // Create new user
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.firstName || !newUserForm.lastName || !newUserForm.email) {
      toast.error("Please fill in the required fields (First Name, Last Name, Email)");
      return;
    }

    const shortWallet = newUserForm.walletAddress
      ? `${newUserForm.walletAddress.slice(0, 4)}...${newUserForm.walletAddress.slice(-4)}`
      : "GB...TEMP";

    const created: ManagedUser = {
      id: `usr_stb_${Math.floor(100 + Math.random() * 900)}`,
      firstName: newUserForm.firstName,
      lastName: newUserForm.lastName,
      email: newUserForm.email,
      phoneNumber: newUserForm.phoneNumber || "+1 (555) 000-0000",
      role: newUserForm.role,
      status: "active",
      kycVerified: newUserForm.kycVerified,
      walletAddress: shortWallet,
      fullWalletAddress:
        newUserForm.walletAddress ||
        "GBLANKWALLETADDRESS1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      escrowsCount: 0,
      completedVolume: "$0 USDC",
      reputationScore: 5.0,
      totalReviews: 0,
      joinedDate: new Date().toISOString().split("T")[0],
    };

    setUsers((prev) => [created, ...prev]);
    toast.success(`User ${created.firstName} ${created.lastName} created successfully!`);
    setIsAddUserOpen(false);
    setNewUserForm({
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      role: "buyer",
      walletAddress: "",
      kycVerified: false,
    });
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "User ID",
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Role",
      "Status",
      "KYC Verified",
      "Wallet Address",
      "Escrows Count",
      "Completed Volume",
      "Reputation Score",
      "Joined Date",
    ];

    const rows = filteredUsers.map((u) => [
      u.id,
      u.firstName,
      u.lastName,
      u.email,
      u.phoneNumber,
      u.role,
      u.status,
      u.kycVerified ? "Yes" : "No",
      u.fullWalletAddress,
      u.escrowsCount,
      u.completedVolume,
      u.reputationScore,
      u.joinedDate,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `truestub-users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("User list exported to CSV");
  };

  // Filter & Sort Logic
  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          user.firstName.toLowerCase().includes(query) ||
          user.lastName.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.id.toLowerCase().includes(query) ||
          user.fullWalletAddress.toLowerCase().includes(query);

        const matchesRole = roleFilter === "all" || user.role === roleFilter;
        const matchesStatus =
          statusFilter === "all" || user.status === statusFilter;
        const matchesKyc =
          kycFilter === "all" ||
          (kycFilter === "verified" && user.kycVerified) ||
          (kycFilter === "unverified" && !user.kycVerified);

        return matchesSearch && matchesRole && matchesStatus && matchesKyc;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];

        if (typeof valA === "string" && typeof valB === "string") {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (typeof valA === "number" && typeof valB === "number") {
          return sortAsc ? valA - valB : valB - valA;
        }
        return 0;
      });
  }, [users, searchQuery, roleFilter, statusFilter, kycFilter, sortField, sortAsc]);

  // Metrics
  const stats = useMemo(() => {
    const total = users.length;
    const sellers = users.filter((u) => u.role === "seller").length;
    const activeEscrows = users.reduce((acc, u) => acc + u.escrowsCount, 0);
    const flaggedOrSuspended = users.filter(
      (u) => u.status === "flagged" || u.status === "suspended"
    ).length;
    return { total, sellers, activeEscrows, flaggedOrSuspended };
  }, [users]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + pageSize);

  const toggleSort = (field: keyof ManagedUser) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "admin":
        return (
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-300">
            Admin
          </Badge>
        );
      case "moderator":
        return (
          <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-300">
            Moderator
          </Badge>
        );
      case "seller":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300">
            Seller
          </Badge>
        );
      case "buyer":
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Buyer
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Active
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Pending
          </span>
        );
      case "flagged":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
            <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />
            Flagged
          </span>
        );
      case "suspended":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            Suspended
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="w-8 h-8 text-primary" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor platform users, verify Stellar escrow traders, manage roles, and review moderation flags.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddUserOpen(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Accounts
            </CardTitle>
            <Users className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              <span>+14% from last month</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Verified Sellers
            </CardTitle>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sellers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Stellar escrow authorized
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Completed Escrows
            </CardTitle>
            <Wallet className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeEscrows}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all user accounts
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Flagged / Suspended
            </CardTitle>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stats.flaggedOrSuspended}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Requires moderator review
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card with Search & Filters */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold">User Directory</CardTitle>
              <CardDescription>
                Search, filter, and moderate registered accounts and Stellar wallet connections.
              </CardDescription>
            </div>

            {/* Search and Filters bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search name, email, wallet..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 text-sm h-9"
                />
              </div>

              {/* Role filter */}
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 px-3 py-1 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Filter by Role"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
                <option value="seller">Seller</option>
                <option value="buyer">Buyer</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 px-3 py-1 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Filter by Status"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="flagged">Flagged</option>
                <option value="suspended">Suspended</option>
              </select>

              {/* KYC filter */}
              <select
                value={kycFilter}
                onChange={(e) => {
                  setKycFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 px-3 py-1 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Filter by KYC"
              >
                <option value="all">All KYC</option>
                <option value="verified">KYC Verified</option>
                <option value="unverified">Unverified</option>
              </select>

              {(searchQuery || roleFilter !== "all" || statusFilter !== "all" || kycFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setRoleFilter("all");
                    setStatusFilter("all");
                    setKycFilter("all");
                    setPage(1);
                  }}
                  className="text-xs h-9"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[240px]">
                    <button
                      type="button"
                      onClick={() => toggleSort("firstName")}
                      className="flex items-center gap-1 font-semibold text-foreground hover:text-foreground/80"
                    >
                      User
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Stellar Wallet</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("escrowsCount")}
                      className="flex items-center gap-1 font-semibold text-foreground hover:text-foreground/80"
                    >
                      Escrows
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("reputationScore")}
                      className="flex items-center gap-1 font-semibold text-foreground hover:text-foreground/80"
                    >
                      Reputation
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead>KYC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("joinedDate")}
                      className="flex items-center gap-1 font-semibold text-foreground hover:text-foreground/80"
                    >
                      Joined
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Users className="w-8 h-8 mb-2 opacity-30" />
                        <p className="text-sm font-medium">No users match your criteria</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Try adjusting search terms or filters
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedUsers.map((user) => (
                    <TableRow key={user.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {user.firstName[0]}
                            {user.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-foreground truncate">
                              {user.firstName} {user.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>{getRoleBadge(user.role)}</TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                          <span>{user.walletAddress}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(user.fullWalletAddress)}
                            className="p-1 hover:text-foreground rounded transition-colors"
                            title="Copy full wallet address"
                          >
                            {copiedAddress === user.fullWalletAddress ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="text-sm font-medium">{user.escrowsCount}</div>
                        <div className="text-xs text-muted-foreground">{user.completedVolume}</div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>{user.reputationScore.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">({user.totalReviews})</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        {user.kycVerified ? (
                          <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <ShieldCheck className="w-4 h-4" />
                            <span>Verified</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Shield className="w-4 h-4" />
                            <span>Unverified</span>
                          </div>
                        )}
                      </TableCell>

                      <TableCell>{getStatusBadge(user.status)}</TableCell>

                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {user.joinedDate}
                      </TableCell>

                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => setSelectedUser(user)}
                              className="cursor-pointer gap-2"
                            >
                              <Eye className="w-4 h-4 text-blue-500" />
                              View Profile Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingRoleUser(user);
                                setNewRoleValue(user.role);
                              }}
                              className="cursor-pointer gap-2"
                            >
                              <Edit3 className="w-4 h-4 text-purple-500" />
                              Edit Role
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCopy(user.fullWalletAddress)}
                              className="cursor-pointer gap-2"
                            >
                              <Copy className="w-4 h-4 text-muted-foreground" />
                              Copy Wallet Address
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleToggleStatus(user)}
                              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                            >
                              {user.status === "suspended" || user.status === "flagged" ? (
                                <>
                                  <UserCheck className="w-4 h-4 text-emerald-600" />
                                  <span className="text-emerald-600">Reactivate Account</span>
                                </>
                              ) : (
                                <>
                                  <UserX className="w-4 h-4" />
                                  <span>Suspend Account</span>
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span>
                {filteredUsers.length === 0
                  ? "0 of 0 users"
                  : `Showing ${startIndex + 1}–${Math.min(startIndex + pageSize, filteredUsers.length)} of ${filteredUsers.length} users`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs px-1">
                  {safePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Details Modal */}
      {selectedUser && (
        <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  {selectedUser.firstName[0]}
                  {selectedUser.lastName[0]}
                </div>
                {selectedUser.firstName} {selectedUser.lastName}
              </DialogTitle>
              <DialogDescription>
                User ID: <span className="font-mono text-xs">{selectedUser.id}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs block">Email</span>
                  <div className="font-medium flex items-center gap-1 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    {selectedUser.email}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block">Phone</span>
                  <div className="font-medium flex items-center gap-1 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    {selectedUser.phoneNumber}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block">Role</span>
                  <div className="mt-1">{getRoleBadge(selectedUser.role)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block">Account Status</span>
                  <div className="mt-1">{getStatusBadge(selectedUser.status)}</div>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase">
                  <span>Stellar Wallet Details</span>
                  {selectedUser.kycVerified && (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      KYC Verified
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs bg-background p-2 rounded border break-all flex items-center justify-between">
                  <span>{selectedUser.fullWalletAddress}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0 ml-2"
                    onClick={() => handleCopy(selectedUser.fullWalletAddress)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Escrows</div>
                  <div className="text-base font-bold">{selectedUser.escrowsCount}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Volume</div>
                  <div className="text-sm font-bold truncate">{selectedUser.completedVolume}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Rating</div>
                  <div className="text-base font-bold flex items-center justify-center gap-1 text-amber-500">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {selectedUser.reputationScore}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedUser(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Role Modal */}
      {editingRoleUser && (
        <Dialog open={!!editingRoleUser} onOpenChange={() => setEditingRoleUser(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User Role</DialogTitle>
              <DialogDescription>
                Update permission tier for {editingRoleUser.firstName} {editingRoleUser.lastName} ({editingRoleUser.email}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="role-select">Select New Role</Label>
                <select
                  id="role-select"
                  value={newRoleValue}
                  onChange={(e) => setNewRoleValue(e.target.value as UserRole)}
                  className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="buyer">Buyer (Standard ticketing access)</option>
                  <option value="seller">Seller (Create ticket listings & escrows)</option>
                  <option value="moderator">Moderator (Dispute & review management)</option>
                  <option value="admin">Admin (Full system and user control)</option>
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingRoleUser(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveRole}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add User Modal */}
      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Register an account directly to the TrueStub directory.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="first-name">First Name *</Label>
                  <Input
                    id="first-name"
                    required
                    placeholder="e.g. Alice"
                    value={newUserForm.firstName}
                    onChange={(e) =>
                      setNewUserForm((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="last-name">Last Name *</Label>
                  <Input
                    id="last-name"
                    required
                    placeholder="e.g. Vance"
                    value={newUserForm.lastName}
                    onChange={(e) =>
                      setNewUserForm((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="user-email">Email Address *</Label>
                <Input
                  id="user-email"
                  type="email"
                  required
                  placeholder="alice@example.com"
                  value={newUserForm.email}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="user-phone">Phone Number</Label>
                <Input
                  id="user-phone"
                  placeholder="+1 (555) 000-0000"
                  value={newUserForm.phoneNumber}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({ ...prev, phoneNumber: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-user-role">Role</Label>
                <select
                  id="new-user-role"
                  value={newUserForm.role}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({ ...prev, role: e.target.value as UserRole }))
                  }
                  className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-user-wallet">Stellar Public Key</Label>
                <Input
                  id="new-user-wallet"
                  placeholder="G..."
                  value={newUserForm.walletAddress}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({ ...prev, walletAddress: e.target.value }))
                  }
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="kyc-check"
                  checked={newUserForm.kycVerified}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({ ...prev, kycVerified: e.target.checked }))
                  }
                  className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                />
                <Label htmlFor="kyc-check" className="text-sm font-normal cursor-pointer">
                  Mark as KYC Verified
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddUserOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create User</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
