import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  LayoutDashboard, 
  ClipboardCheck, 
  Banknote, 
  FileSignature, 
  Calendar as CalendarIcon, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  X, 
  Printer, 
  Check, 
  UserPlus, 
  Clock, 
  Heart, 
  CreditCard, 
  Smartphone, 
  Lock, 
  MapPin, 
  Phone, 
  Mail, 
  ShieldCheck, 
  Download, 
  FileText,
  UserCheck,
  Award,
  AlertCircle,
  TrendingUp,
  CirclePlus,
  Upload,
  Camera
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where,
  setDoc,
  getDocs
} from 'firebase/firestore';
import { db, secondaryAuth } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { motion } from 'motion/react';
import html2canvas from 'html2canvas';

interface Employee {
  id: string;
  name: string;
  designation: string;
  phone: string;
  email?: string;
  salary: number;
  joiningDate?: string;
  schedule?: string;
  status: 'active' | 'inactive';
  // Extended fields
  photoUrl?: string;
  bloodGroup?: string;
  emergencyPhone?: string;
  paymentMode?: 'cash' | 'bank' | 'mfs';
  bankName?: string;
  accountNo?: string;
  mfsNo?: string;
  shiftStart?: string;
  shiftEnd?: string;
  yearlyLeaves?: number;
  allowLogin?: boolean;
  username?: string;
  password?: string;
  branchId?: string;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400; // Profile photos don't need to be huge; keeping it light
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85)); // Compressed JPEG
        } else {
          resolve(reader.result as string);
        }
      };
      img.onerror = () => resolve(reader.result as string);
      img.src = event.target?.result as string;
    };
    reader.onerror = error => reject(error);
  });
};

interface HRMProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  employees: Employee[];
  onAddEmployee: (emp: Omit<Employee, 'id'>) => void;
  user: any;
  settings: any;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' }) => void;
  branches: any[];
}

export function HRM({ activeTab, setActiveTab, employees, onAddEmployee, user, settings, setNotification, branches }: HRMProps) {
  const isBn = settings.systemLanguage === 'bn';
  const currencySymbol = settings.currencySymbol || '৳';

  // State Management
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [employeeLogins, setEmployeeLogins] = useState<Record<string, { username: string; password: string }>>({});
  const [isGeneratingUsername, setIsGeneratingUsername] = useState<Record<string, boolean>>({});

  const handleCreateUsername = async (emp: Employee) => {
    setIsGeneratingUsername(prev => ({ ...prev, [emp.id]: true }));
    try {
      const code = (settings.shopCode || settings.shopId || '').toString().replace(/^SHP-/i, '').replace(/[^0-9]/g, '').slice(0, 6);
      const cleanName = emp.name.toLowerCase().trim().split(' ')[0].replace(/[^a-z0-9]/g, '');
      const baseName = cleanName ? `${cleanName}_${code}` : `emp_${code}`;
      
      let finalUsername = baseName;
      let attempt = 0;
      let isUnique = false;
      
      while (!isUnique && attempt < 10) {
        const candidate = attempt === 0 ? finalUsername : `${baseName}${attempt}`;
        const q = query(collection(db, 'users'), where('username', '==', candidate));
        const snap = await getDocs(q);
        const collision = snap.docs.some(docObj => docObj.data().employeeId !== emp.id);
        
        if (!collision) {
          finalUsername = candidate;
          isUnique = true;
        } else {
          attempt++;
        }
      }
      
      if (!isUnique) {
        finalUsername = `${baseName}_${Math.floor(100 + Math.random() * 900)}`;
      }

      const creds = employeeLogins[emp.id] || { username: emp.username || '', password: emp.password || '' };
      let newPin = creds.password;
      if (!newPin || newPin.length !== 6) {
        newPin = Math.floor(100000 + Math.random() * 900000).toString();
      }

      setEmployeeLogins(prev => ({
        ...prev,
        [emp.id]: {
          username: finalUsername,
          password: newPin
        }
      }));

      setNotification({
        message: isBn 
          ? 'ইউজারনেম সফলভাবে সিস্টেম থেকে তৈরি করা হয়েছে!' 
          : 'Username auto-generated successfully!',
        type: 'success'
      });
    } catch (err: any) {
      console.error("Username generation error:", err);
      setNotification({
        message: isBn ? 'ইউজারনেম তৈরি করতে ব্যর্থ হয়েছে' : 'Failed to generate unique username',
        type: 'error'
      });
    } finally {
      setIsGeneratingUsername(prev => ({ ...prev, [emp.id]: false }));
    }
  };
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // HRM mock/persisted tracking state helper templates
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);

  // Local Form state
  const [formData, setFormData] = useState<Partial<Employee>>({
    name: '',
    designation: '',
    phone: '',
    email: '',
    salary: 12000,
    joiningDate: new Date().toISOString().split('T')[0],
    schedule: '09:00 AM - 06:00 PM',
    status: 'active',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&h=256&fit=crop',
    bloodGroup: 'O+',
    emergencyPhone: '',
    paymentMode: 'cash',
    bankName: '',
    accountNo: '',
    mfsNo: '',
    shiftStart: '09:00',
    shiftEnd: '18:00',
    yearlyLeaves: 15,
    allowLogin: false
  });

  // Payroll Calc state
  const [selectedMonth, setSelectedMonth] = useState('2026-06');
  const [payrollStaffId, setPayrollStaffId] = useState('');
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [unpaidDays, setUnpaidDays] = useState(0);
  const [bonusAmount, setBonusAmount] = useState(0);

  // Certificate generator print states
  const [selectedCertEmployee, setSelectedCertEmployee] = useState<Employee | null>(null);
  const [certType, setCertType] = useState<'contract' | 'experience'>('experience');
  const [leavingDate, setLeavingDate] = useState(new Date().toISOString().split('T')[0]);
  const [leavingReason, setLeavingReason] = useState(isBn ? 'ব্যক্তিগত কারণ' : 'Personal Reasons');
  const [certPraise, setCertPraise] = useState(isBn ? 'অত্যন্ত পরিশ্রমী এবং বিশ্বস্ত কর্মী।' : 'He has been extremely diligent, hard-working, and trustworthy.');

  // Simulated live attendance system
  useEffect(() => {
    // Let's seed default attendance logs if empty
    if (employees.length > 0 && attendanceLogs.length === 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const initialLogs = employees.map((emp, idx) => ({
        id: `att-${emp.id}-${todayStr}`,
        employeeId: emp.id,
        employeeName: emp.name,
        date: todayStr,
        checkIn: idx % 4 === 0 ? '09:25 AM' : '08:55 AM',
        checkOut: idx % 4 === 0 ? '---' : '06:05 PM',
        status: idx % 5 === 4 ? 'Absent' : idx % 4 === 0 ? 'Late' : 'Present',
        overtime: idx % 3 === 1 ? 2 : 0
      }));
      setAttendanceLogs(initialLogs);
    }
  }, [employees]);

  // Seeding default leave requests if empty
  useEffect(() => {
    if (employees.length > 0 && leaveRequests.length === 0) {
      setLeaveRequests([
        {
          id: 'leave-1',
          employeeId: employees[0].id,
          employeeName: employees[0].name,
          leaveType: isBn ? 'অসুস্থতাজনিত ছুটি (Sick Leave)' : 'Sick Leave',
          startDate: '2026-06-22',
          endDate: '2026-06-23',
          daysCount: 2,
          reason: isBn ? 'জ্বর এবং সর্দি' : 'Severe fever and cold',
          status: 'Pending'
        },
        {
          id: 'leave-2',
          employeeId: employees[1]?.id || 'emp-demo',
          employeeName: employees[1]?.name || 'Demo Waiter',
          leaveType: isBn ? 'আকস্মিক ছুটি (Casual Leave)' : 'Casual Leave',
          startDate: '2026-06-28',
          endDate: '2026-06-29',
          daysCount: 2,
          reason: isBn ? 'ব্যক্তিগত কাজ' : 'Family emergency work',
          status: 'Approved'
        }
      ]);
    }
  }, [employees]);

  // Seeding default payroll history
  useEffect(() => {
    if (employees.length > 0 && payrollHistory.length === 0) {
      setPayrollHistory([
        {
          id: 'pay-1',
          employeeName: employees[0].name,
          month: '2026-05',
          baseSalary: employees[0].salary,
          bonus: 1000,
          deduction: 0,
          finalPay: employees[0].salary + 1000,
          paymentMode: 'Bank Transfer',
          date: '2026-06-02'
        }
      ]);
    }
  }, [employees]);

  const uniqueDesignations = useMemo(() => {
    const list = employees.map(emp => emp.designation).filter(Boolean);
    return Array.from(new Set(list));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.phone.includes(searchTerm) || 
                          (emp.designation || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchDesignation = !designationFilter || emp.designation === designationFilter;
      const matchStatus = !statusFilter || emp.status === statusFilter;
      return matchSearch && matchDesignation && matchStatus;
    });
  }, [employees, searchTerm, designationFilter, statusFilter]);

  // Total payroll state stats
  const stats = useMemo(() => {
    const totalStaff = employees.length;
    const activeStaff = employees.filter(e => e.status === 'active').length;
    const todayStr = new Date().toISOString().split('T')[0];
    const presentToday = attendanceLogs.filter(log => log.date === todayStr && (log.status === 'Present' || log.status === 'Late')).length;
    const pendingLeaves = leaveRequests.filter(req => req.status === 'Pending').length;
    const totalSalaryPromise = employees.reduce((acc, emp) => acc + (Number(emp.salary) || 0), 0);

    return { totalStaff, activeStaff, presentToday, pendingLeaves, totalSalaryPromise };
  }, [employees, attendanceLogs, leaveRequests]);

  const handleOpenAddModal = (emp?: Employee) => {
    if (emp) {
      setEditingEmployee(emp);
      setFormData({
        ...emp,
        allowLogin: !!emp.allowLogin,
        branchId: emp.branchId || (branches && branches[0]?.id) || 'b1'
      });
    } else {
      setEditingEmployee(null);
      setFormData({
        name: '',
        designation: '',
        phone: '',
        email: '',
        salary: 12000,
        joiningDate: new Date().toISOString().split('T')[0],
        schedule: '09:00 AM - 06:00 PM',
        status: 'active',
        photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&h=256&fit=crop',
        bloodGroup: 'A+',
        emergencyPhone: '',
        paymentMode: 'cash',
        bankName: '',
        accountNo: '',
        mfsNo: '',
        shiftStart: '09:00',
        shiftEnd: '18:00',
        yearlyLeaves: 15,
        allowLogin: false,
        branchId: (branches && branches[0]?.id) || 'b1'
      });
    }
    setIsAddModalOpen(true);
  };

  const saveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.designation || !formData.phone) {
      setNotification({
        message: isBn ? 'অনুগ্রহ করে নাম, পদবি এবং ফোন নম্বর পূরণ করুন।' : 'Please fill Name, Designation, and Phone number.',
        type: 'error'
      });
      return;
    }

    try {
      if (editingEmployee) {
        // Update in DB
        const empRef = doc(db, 'employees', editingEmployee.id);
        const updatedData = {
          ...formData,
          salary: Number(formData.salary) || 0,
          branchId: formData.branchId || (branches && branches[0]?.id) || 'b1'
        };
        await updateDoc(empRef, updatedData);

        // Also update in users collection if exists
        const username = editingEmployee.username?.trim().toLowerCase();
        if (username) {
          const userQuery = query(collection(db, 'users'), where('username', '==', username));
          const userSnap = await getDocs(userQuery);
          for (const docObj of userSnap.docs) {
            await updateDoc(doc(db, 'users', docObj.id), {
              displayName: formData.name,
              branchId: formData.branchId || (branches && branches[0]?.id) || 'b1'
            });
          }
        }

        setNotification({
          message: isBn ? 'স্টাফ প্রোফাইল সফলভাবে আপডেট করা হয়েছে।' : 'Employee profile successfully updated.',
          type: 'success'
        });
      } else {
        // Add to DB
        await addDoc(collection(db, 'employees'), {
          ...formData,
          salary: Number(formData.salary) || 0,
          shopId: user.shopId,
          branchId: formData.branchId || (branches && branches[0]?.id) || 'b1'
        });
        setNotification({
          message: isBn ? 'নতুন স্টাফ সফলভাবে যুক্ত করা হয়েছে।' : 'New staff successfully added.',
          type: 'success'
        });
      }
      setIsAddModalOpen(false);
      setEditingEmployee(null);
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error executing database transaction',
        type: 'error'
      });
    }
  };

  const deleteEmployeeProfile = async (id: string) => {
    if (window.confirm(isBn ? 'আপনি কি নিশ্চিতভাবে এই কর্মীর প্রোফাইল ডিলেট করতে চান?' : 'Are you sure you want to delete this staff profile?')) {
      try {
        await deleteDoc(doc(db, 'employees', id));
        setNotification({
          message: isBn ? 'স্টাফ প্রোফাইল ডিলেট করা হয়েছে।' : 'Staff profile has been deleted.',
          type: 'success'
        });
      } catch (err) {
        setNotification({
          message: 'Error deleting document',
          type: 'error'
        });
      }
    }
  };

  // Quick Attendance Actions
  const handlePunchAttendance = (empId: string, actionStatus: 'Present' | 'Late' | 'Absent') => {
    const todayStr = new Date().toISOString().split('T')[0];
    const logId = `att-${empId}-${todayStr}`;
    
    // Check if checkin already exists for today
    const existingIndex = attendanceLogs.findIndex(log => log.id === logId);
    const emp = employees.find(e => e.id === empId);

    if (!emp) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (existingIndex > -1) {
      const updated = [...attendanceLogs];
      updated[existingIndex] = {
        ...updated[existingIndex],
        status: actionStatus,
        checkIn: actionStatus === 'Absent' ? '---' : timeStr
      };
      setAttendanceLogs(updated);
    } else {
      setAttendanceLogs([
        {
          id: logId,
          employeeId: empId,
          employeeName: emp.name,
          date: todayStr,
          checkIn: actionStatus === 'Absent' ? '---' : timeStr,
          checkOut: '---',
          status: actionStatus,
          overtime: 0
        },
        ...attendanceLogs
      ]);
    }

    setNotification({
      message: isBn 
        ? `${emp.name}-এর হাজিরা নিশ্চিত করা হয়েছে (${actionStatus})` 
        : `Attendance marked for ${emp.name} as ${actionStatus}`,
      type: 'success'
    });
  };

  // Salary calculation computed variables
  const computedSalaryDetails = useMemo(() => {
    const selectedEmp = employees.find(emp => emp.id === payrollStaffId);
    if (!selectedEmp) return null;

    const base = Number(selectedEmp.salary) || 0;
    const otRateHourly = Math.round((base / 240) * 1.5); // calculated on 30 days standard 8 hour standard shift x 1.5 multiplier
    const overtimePayout = overtimeHours * otRateHourly;
    const deductionDaily = Math.round(base / 30);
    const regularDeductions = unpaidDays * deductionDaily;
    const finalAmount = base + overtimePayout + Number(bonusAmount) - regularDeductions;

    return {
      base,
      otHours: overtimeHours,
      otRate: otRateHourly,
      otPayout: overtimePayout,
      unpaidDaysCount: unpaidDays,
      perDayDeduction: deductionDaily,
      payoutDeductions: regularDeductions,
      bonus: Number(bonusAmount),
      netSalaryPayable: finalAmount,
      empName: selectedEmp.name,
      empDesignation: selectedEmp.designation,
      paymentModeChosen: selectedEmp.paymentMode || 'cash'
    };
  }, [employees, payrollStaffId, overtimeHours, unpaidDays, bonusAmount]);

  const handlePaySalary = () => {
    if (!computedSalaryDetails) return;

    const newPayment = {
      id: `payroll-${Date.now()}`,
      employeeName: computedSalaryDetails.empName,
      month: selectedMonth,
      baseSalary: computedSalaryDetails.base,
      bonus: computedSalaryDetails.bonus,
      deduction: computedSalaryDetails.payoutDeductions,
      finalPay: computedSalaryDetails.netSalaryPayable,
      paymentMode: computedSalaryDetails.paymentModeChosen === 'bank' ? 'Bank Transfer' : computedSalaryDetails.paymentModeChosen === 'mfs' ? 'MFS Wallet' : 'Cash in Hand',
      date: new Date().toISOString().split('T')[0]
    };

    setPayrollHistory([newPayment, ...payrollHistory]);
    setNotification({
      message: isBn 
        ? `সফলভাবে ${computedSalaryDetails.empName}-এর বেতন (${selectedMonth}) পরিশোধ করা হয়েছে!` 
        : `Successfully paid salary to ${computedSalaryDetails.empName} for ${selectedMonth}!`,
      type: 'success'
    });

    // Reset fields
    setOvertimeHours(0);
    setUnpaidDays(0);
    setBonusAmount(0);
  };

  const handleAddCustomLeaveRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    
    const empId = fd.get('employeeId') as string;
    const emp = employees.find(ep => ep.id === empId);

    if (!emp) {
      setNotification({ message: 'Invalid employee selection', type: 'error' });
      return;
    }

    const start = fd.get('startDate') as string;
    const end = fd.get('endDate') as string;

    const daysCount = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const newLeave = {
      id: `leave-${Date.now()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      leaveType: fd.get('leaveType') as string,
      startDate: start,
      endDate: end,
      daysCount,
      reason: fd.get('reason') as string,
      status: 'Pending'
    };

    setLeaveRequests([newLeave, ...leaveRequests]);
    setNotification({
      message: isBn ? 'ছুটির আবেদন দাখিল করা হয়েছে।' : 'Leave application submitted successfully.',
      type: 'success'
    });
    form.reset();
  };

  const handleApproveLeave = (leaveId: string, nextStatus: 'Approved' | 'Rejected') => {
    setLeaveRequests(leaveRequests.map(req => {
      if (req.id === leaveId) {
        return { ...req, status: nextStatus };
      }
      return req;
    }));

    setNotification({
      message: isBn 
        ? `আবেদনটি ${nextStatus === 'Approved' ? 'অনুমোদন' : 'বাতিল'} করা হয়েছে।` 
        : `Leave application ${nextStatus}.`,
      type: 'success'
    });
  };

  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState<Record<string, boolean>>({});

  const handleSaveCredentials = async (emp: Employee) => {
    const creds = employeeLogins[emp.id] || { username: emp.username || '', password: emp.password || '' };
    const username = creds.username.trim().toLowerCase();
    const password = creds.password.trim();

    if (!username) {
      setNotification({ message: isBn ? 'ইউজারনেম দিন!' : 'Username is required!', type: 'error' });
      return;
    }
    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      setNotification({ message: isBn ? 'ইউজারনেম ছোট হাতের অক্ষর এবং সংখ্যা হতে হবে (কমপক্ষে ৩ টি ক্যারেক্টার)।' : 'Username must be lowercase letters/numbers, minimum 3 characters.', type: 'error' });
      return;
    }
    if (password.length !== 6) {
      setNotification({ message: isBn ? 'পাসওয়ার্ডটি অবশ্যই একদম ৬ সংখ্যার হতে হবে।' : 'Password must be exactly 6 characters/digits.', type: 'error' });
      return;
    }

    setIsUpdatingCredentials(prev => ({ ...prev, [emp.id]: true }));

    try {
      const email = `${username}@bismillahstore.local`;
      let uid = "";

      // Check if username already exists in another user's document in the 'users' collection
      const userQuery = query(collection(db, 'users'), where('username', '==', username));
      const userSnap = await getDocs(userQuery);
      const otherUserExists = userSnap.docs.some(docObj => docObj.data().employeeId !== emp.id);
      if (otherUserExists) {
        setNotification({ message: isBn ? 'এই ইউজারনেমটি ইতিমধ্যে অন্য একজন ব্যবহার করছেন!' : 'This username is already taken by another user!', type: 'error' });
        setIsUpdatingCredentials(prev => ({ ...prev, [emp.id]: false }));
        return;
      }

      // Recreate or create authentication account
      try {
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        uid = credential.user.uid;
      } catch (createErr: any) {
        if (createErr.code === 'auth/email-already-in-use') {
          try {
            // Delete and recreate sequence to securely update password
            const oldPass = emp.password || password;
            const userCred = await signInWithEmailAndPassword(secondaryAuth, email, oldPass);
            if (userCred.user) {
              uid = userCred.user.uid;
              await userCred.user.delete();
            }
            const newCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            uid = newCred.user.uid;
          } catch (recreateErr) {
            console.warn("Deleted recreation failed, doing direct recreation fallback:", recreateErr);
            try {
              const userCred = await signInWithEmailAndPassword(secondaryAuth, email, password);
              if (userCred.user) {
                uid = userCred.user.uid;
              }
            } catch (sigErr) {
              uid = `uid-${username}`;
            }
          }
        } else {
          throw createErr;
        }
      }

      // Map designation to appropriate system role
      const getMappedRole = (designation: string): string => {
        const d = designation.toLowerCase().trim();
        if (d.includes('admin')) return 'admin';
        if (d.includes('manager') && !d.includes('assistant') && !d.includes('sales')) return 'manager';
        if (d.includes('assistant') && d.includes('manager')) return 'assistant_manager';
        if (d.includes('sales') && d.includes('manager')) return 'sales_manager';
        if (d.includes('warehouse') || d.includes('store')) return 'warehouse';
        return 'sales_team';
      };

      const userRole = getMappedRole(emp.designation);

      // Write user document
      if (uid) {
        await setDoc(doc(db, 'users', uid), {
          displayName: emp.name,
          username: username,
          password: password,
          role: userRole,
          shopId: user.shopId,
          employeeId: emp.id,
          allowLogin: true,
          branchId: emp.branchId || (branches && branches[0]?.id) || 'b1'
        });
      }

      // Write to employees collection
      await updateDoc(doc(db, 'employees', emp.id), {
        username: username,
        password: password,
        allowLogin: true
      });

      setNotification({
        message: isBn 
          ? `${emp.name}-এর জন্য লগইন চালুর সাথে ক্রেডেনশিয়াল সফলভাবে সেট করা হয়েছে!` 
          : `Successfully configured credentials and activated system login for ${emp.name}!`,
        type: 'success'
      });

    } catch (err: any) {
      setNotification({
        message: err.message || 'Error configuring login credentials',
        type: 'error'
      });
    } finally {
      setIsUpdatingCredentials(prev => ({ ...prev, [emp.id]: false }));
    }
  };

  const handleLockAccess = async (emp: Employee) => {
    try {
      // Find the corresponding Firebase user document to disable it there as well
      const username = emp.username?.trim().toLowerCase();
      if (username) {
        const userQuery = query(collection(db, 'users'), where('username', '==', username));
        const userSnap = await getDocs(userQuery);
        for (const docObj of userSnap.docs) {
          await updateDoc(doc(db, 'users', docObj.id), {
            allowLogin: false
          });
        }
      }

      // Update in employees collection
      await updateDoc(doc(db, 'employees', emp.id), {
        allowLogin: false
      });

      setNotification({
        message: isBn 
          ? `${emp.name}-এর লগইন অ্যাক্সেস সফলভাবে বন্ধ করা হয়েছে!` 
          : `Successfully revoked system login access for ${emp.name}!`,
        type: 'success'
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error revoking access',
        type: 'error'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            💼 {isBn ? 'ঐচ.আর.এম (মানব সম্পদ বিভাগ)' : 'HRM Suite'}
          </h2>
          <p className="text-gray-500 text-xs md:text-sm font-semibold mt-1">
            {isBn 
              ? 'স্টাফ প্রোফাইল, দৈনিক হাজিরা, অটোমেটেড সেলারি স্লিপ জেনারেটর এবং প্রফেশনাল সনদপত্র ম্যানেজমেন্ট।' 
              : 'Enterprise-grade staff profiles, attendance tracking, customizable certificate designs, and auto-payroll bills.'}
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'staff_directory' && (
            <button
              onClick={() => handleOpenAddModal()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-md shadow-indigo-600/10 hover:-translate-y-0.5"
            >
              <UserPlus className="w-4 h-4" />
              {isBn ? 'নতুন স্টাফ যুক্ত করুন' : 'Add New Staff'}
            </button>
          )}
        </div>
      </div>

      {/* HRM Quick Nested Navigation Sub Tabs (Exclusive display matching user setup) */}
      <div className="flex flex-wrap gap-2 border-b border-gray-150 pb-1">
        {[
          { id: 'hrm_dashboard', label: isBn ? 'ড্যাশবোর্ড' : 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'staff_directory', label: isBn ? 'স্টাফ প্রোফাইল' : 'Staff Profiles', icon: Users },
          { id: 'attendance_tracker', label: isBn ? 'হাজিরা ও শিফট' : 'Attendance & Duty', icon: ClipboardCheck },
          { id: 'payroll_disbursal', label: isBn ? 'বেতন পরিশোধ' : 'Payroll Disbursal', icon: Banknote },
          { id: 'leave_planner', label: isBn ? 'ছুটি ও হলিডে' : 'Leaves & Holidays', icon: CalendarIcon },
          { id: 'system_login', label: isBn ? 'সিস্টেম লগইন' : 'System Login', icon: Lock },
          { id: 'employment_contracts', label: isBn ? 'চুক্তিপত্র ও সার্টিফিকেট' : 'Contracts & Releases', icon: FileSignature }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all relative border ${
                isActive 
                  ? 'bg-slate-900 border-slate-950 text-white shadow-md' 
                  : 'bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-900 border-gray-200/60'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.id === 'leave_planner' && stats.pendingLeaves > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-bounce border border-white">
                  {stats.pendingLeaves}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* RENDER HRM TABS */}

      {/* 1. Dashboard Overview */}
      {activeTab === 'hrm_dashboard' && (
        <div className="space-y-6">
          {/* Top Metric Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-5 rounded-3xl border border-indigo-100/60">
              <span className="p-2.5 bg-white rounded-2xl text-indigo-600 shadow-sm inline-block"><Users className="w-5 h-5" /></span>
              <p className="text-[10px] uppercase font-black tracking-wider text-indigo-500 mt-4">{isBn ? 'সর্বমোট স্টাফ' : 'Total Employees'}</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.totalStaff}</h3>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 rounded-3xl border border-emerald-100/60">
              <span className="p-2.5 bg-white rounded-2xl text-emerald-600 shadow-sm inline-block"><UserCheck className="w-5 h-5" /></span>
              <p className="text-[10px] uppercase font-black tracking-wider text-emerald-500 mt-4">{isBn ? 'আজকে উপস্থিত' : 'Present Today'}</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.presentToday} / {stats.activeStaff}</h3>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 rounded-3xl border border-amber-100/60">
              <span className="p-2.5 bg-white rounded-2xl text-amber-600 shadow-sm inline-block"><CalendarIcon className="w-5 h-5" /></span>
              <p className="text-[10px] uppercase font-black tracking-wider text-amber-500 mt-4">{isBn ? 'ছুটির আবেদন' : 'Pending Leaves'}</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1 mb-0.5">{stats.pendingLeaves}</h3>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 p-5 rounded-3xl border border-teal-100/60">
              <span className="p-2.5 bg-white rounded-2xl text-teal-600 shadow-sm inline-block"><Banknote className="w-5 h-5" /></span>
              <p className="text-[10px] uppercase font-black tracking-wider text-teal-800 mt-4">{isBn ? 'মাসিক বেতন বাজেট' : 'Monthly Payroll'}</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.totalSalaryPromise.toLocaleString()}{currencySymbol}</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Quick Attendance punch list */}
            <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm md:col-span-7 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest border-b pb-2 flex items-center justify-between">
                <span>⚡ {isBn ? 'দ্রুত হাজিরা কার্ড' : 'Quick Attendance Logger'}</span>
                <span className="text-[10px] bg-slate-100 px-2.5 py-1 rounded-full text-slate-500 font-bold">{isBn ? 'আজকের ডায়েরি' : "Today's logs"}</span>
              </h3>
              {employees.length === 0 ? (
                <div className="py-6 text-center text-gray-400 font-bold text-xs">
                  {isBn ? 'স্টাফ সেকশনে কোনো তালিকা নেই!' : 'No staff profiles found. Please register employees first.'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[350px] overflow-y-auto pr-1">
                  {employees.map(emp => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const punch = attendanceLogs.find(log => log.employeeId === emp.id && log.date === todayStr);
                    return (
                      <div key={emp.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <img src={emp.photoUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&h=256&fit=crop"} className="w-9 h-9 rounded-full object-cover border" alt="Profile" />
                          <div>
                            <p className="text-xs font-bold text-gray-900">{emp.name}</p>
                            <p className="text-[10px] text-gray-400 font-bold">{emp.designation}</p>
                          </div>
                        </div>

                        {/* Mark Attendance Trigger button list */}
                        <div className="flex items-center gap-1.5">
                          {punch ? (
                            <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${
                              punch.status === 'Present' 
                                ? 'bg-emerald-50 text-emerald-600' 
                                : punch.status === 'Late' 
                                ? 'bg-amber-50 text-amber-600 animate-pulse' 
                                : 'bg-red-50 text-red-500'
                            }`}>
                              🟢 {punch.status} ({punch.checkIn})
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => handlePunchAttendance(emp.id, 'Present')}
                                className="px-2.5 py-1.5 hover:bg-emerald-600 bg-emerald-50 hover:text-white text-emerald-600 rounded-xl text-[10px] font-black transition-colors"
                              >
                                {isBn ? 'উপস্থিত' : 'Present'}
                              </button>
                              <button
                                onClick={() => handlePunchAttendance(emp.id, 'Late')}
                                className="px-2.5 py-1.5 hover:bg-amber-600 bg-amber-50 hover:text-white text-amber-600 rounded-xl text-[10px] font-black transition-colors"
                              >
                                {isBn ? 'দেরি' : 'Late'}
                              </button>
                              <button
                                onClick={() => handlePunchAttendance(emp.id, 'Absent')}
                                className="px-2.5 py-1.5 hover:bg-red-600 bg-red-50 hover:text-white text-red-500 rounded-xl text-[10px] font-black transition-colors"
                              >
                                {isBn ? 'অনুপস্থিত' : 'Absent'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Shift Rules / Government holiday details */}
            <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm md:col-span-5 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest border-b pb-2">
                📋 {isBn ? 'ছুটি ও শিডিউল রুলস' : 'Active Shifts & Policies'}
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-indigo-50/40 rounded-2xl border border-indigo-150">
                  <p className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    {isBn ? 'ডে শিফট (সকাল ০৯ টা - সন্ধ্যা ০৬ টা)' : 'General/Day Shift (09:00 AM - 06:00 PM)'}
                  </p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">
                    {isBn ? 'নির্ধারিত ১৫ মিনিট বিলম্ব ছাড়যোগ্য, পরবর্তী বিলম্বগুলো স্যালারি স্লিপে হাফ ডে ডিডাকশন হিসেব হবে।' : '15-min grace window applies. Unexcused delay marks employee as Late.'}
                  </p>
                </div>

                <div className="p-3 bg-violet-50/40 rounded-2xl border border-violet-150">
                  <p className="text-xs font-black text-violet-950 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-violet-600" />
                    {isBn ? 'নাইট শিফট (সন্ধ্যা ০৬ টা - রাত ০৩ টা)' : 'Night Shift (06:00 PM - 03:00 AM)'}
                  </p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">
                    {isBn ? 'রেস্টুরেন্ট কিচেন ও ওয়েটার কর্মীদের জন্য প্রযোজ্য শিফট।' : 'Applied only for evening catering personnel and waiters.'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border">
                  <p className="text-xs font-black text-gray-700">🇧🇩 {isBn ? 'সরকারি বিধিমালা ও বাৎসরিক ছুটি' : 'Yearly Leave Quotas (Bangladesh)'}</p>
                  <ul className="text-[10px] text-gray-500 font-bold mt-1 list-disc pl-4 space-y-0.5">
                    <li>{isBn ? 'নৈমিত্তিক ছুটি (Casual Leave) - বাৎসরিক ১০ দিন' : 'Casual Leave - 10 days'}</li>
                    <li>{isBn ? 'অসুস্থতাজনিত ছুটি (Sick Leave) - বাৎসরিক ১৪ দিন' : 'Sick Leave - 14 days'}</li>
                    <li>{isBn ? 'সরকারি উৎসব ছুটি - বাৎসরিক ১১ দিন' : 'Government Festival Leaves - 11 days'}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Staff Directory */}
      {activeTab === 'staff_directory' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-sm flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={isBn ? 'স্টাফের নাম, ফোন বা পদবি দিয়ে সার্চ করুন...' : 'Search staff directory by name, phone or role...'}
                className="w-full pl-10 pr-4 py-2 bg-slate-55 text-xs font-semibold rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2">
              <select
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 outline-none"
                value={designationFilter}
                onChange={e => setDesignationFilter(e.target.value)}
              >
                <option value="">{isBn ? '-- পদবি ফিল্টার --' : '-- All Roles --'}</option>
                {uniqueDesignations.map(des => (
                  <option key={des} value={des}>{des}</option>
                ))}
              </select>

              <select
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 outline-none"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="">{isBn ? '-- স্ট্যাটাস --' : '-- Status --'}</option>
                <option value="active">{isBn ? 'সক্রিয় (Active)' : 'Active'}</option>
                <option value="inactive">{isBn ? 'নিষ্ক্রিয় (Inactive)' : 'Inactive'}</option>
              </select>
            </div>
          </div>

          {/* Directory Listings */}
          {filteredEmployees.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-gray-150 text-center text-gray-400">
              <span className="p-4 bg-gray-50 rounded-full inline-block text-gray-400 mb-3"><Users className="w-10 h-10" /></span>
              <p className="text-xs font-black uppercase text-gray-400 tracking-wider">
                {isBn ? 'খুঁজে পাওয়া যায়নি!' : 'No matched staff profiles found.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEmployees.map(emp => (
                <div key={emp.id} className="bg-white rounded-3xl border border-gray-150/70 shadow-sm overflow-hidden hover:shadow-md transition-shadow group relative">
                  
                  {/* Decorative Banner */}
                  <div className="h-16 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 absolute top-0 left-0 right-0" />
                  
                  <div className="p-6 pt-8 relative z-10 flex flex-col items-center">
                    {/* Profile Picture */}
                    <img 
                      src={emp.photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&h=256&fit=crop'} 
                      className="w-20 h-20 rounded-full border-4 border-white shadow-md object-cover group-hover:scale-105 transition-transform" 
                      alt={emp.name} 
                    />
                    
                    {/* Status Badge */}
                    <span className={`mt-3 px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      emp.status === 'active' 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : 'bg-red-50 text-red-500'
                    }`}>
                      {emp.status}
                    </span>

                    <h3 className="text-sm font-black text-gray-900 mt-2 text-center">{emp.name}</h3>
                    <p className="text-[10px] font-bold text-gray-400 tracking-wide bg-gray-50 px-2.5 py-0.5 rounded-lg border border-gray-100 mt-1 uppercase">
                      💼 {emp.designation}
                    </p>

                    {/* Metadata specs */}
                    <div className="w-full border-t border-dashed border-gray-100 mt-4 pt-3 space-y-2 text-left">
                      <div className="flex justify-between items-center text-[11px] font-semibold text-gray-500">
                        <span>📞 {isBn ? 'ফোন:' : 'Phone:'}</span>
                        <span className="font-bold text-slate-800">{emp.phone}</span>
                      </div>
                      {emp.email && (
                        <div className="flex justify-between items-center text-[11px] font-semibold text-gray-500">
                          <span>✉️ {isBn ? 'ইমেইল:' : 'Email:'}</span>
                          <span className="truncate max-w-[150px] font-bold text-slate-800">{emp.email}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-[11px] font-semibold text-gray-500">
                        <span>🩸 {isBn ? 'রক্তের গ্রুপ:' : 'Blood Group:'}</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                          emp.bloodGroup ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-50 text-slate-500'
                        }`}>{emp.bloodGroup || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-gray-500">
                        <span>💰 {isBn ? 'বেতন:' : 'Basic Salary:'}</span>
                        <span className="font-extrabold text-slate-900">{emp.salary.toLocaleString()}{currencySymbol}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-gray-500">
                        <span>🏢 {isBn ? 'শাখা:' : 'Branch:'}</span>
                        <span className="font-extrabold text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded">
                          {branches?.find(b => b.id === emp.branchId)?.name || (isBn ? 'মেইন শাখা' : 'Main Branch')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-gray-500">
                        <span>🕒 {isBn ? 'শিফট:' : 'Duty shift:'}</span>
                        <span className="font-mono text-[10px] bg-slate-50 px-2 py-0.5 rounded font-bold text-slate-700">{emp.schedule || '09:00 - 18:00'}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-gray-500">
                        <span>🔑 {isBn ? 'সিস্টেম লগইন:' : 'System Login:'}</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                          emp.allowLogin ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-gray-150 text-gray-400'
                        }`}>{emp.allowLogin ? (isBn ? 'অনুমতি আছে' : 'Allowed') : (isBn ? 'অনুমতি নেই' : 'Disabled')}</span>
                      </div>
                    </div>

                    {/* Action Panel */}
                    <div className="w-full grid grid-cols-3 gap-2 border-t mt-4 pt-3 z-20">
                      <button
                        onClick={() => handleOpenAddModal(emp)}
                        className="py-1.5 px-2 hover:bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center justify-center gap-1"
                        title="Edit profile"
                      >
                        <Edit className="w-3.5 h-3.5 text-blue-500" />
                        {isBn ? 'এডিট' : 'Edit'}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedCertEmployee(emp);
                          setSelectedCertEmployee({ ...emp });
                          setActiveTab('employment_contracts');
                        }}
                        className="py-1.5 px-2 hover:bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center justify-center gap-1"
                        title="Generate Experience Certificate"
                      >
                        <Award className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                        {isBn ? 'সনদ' : 'Cert'}
                      </button>
                      <button
                        onClick={() => deleteEmployeeProfile(emp.id)}
                        className="py-1.5 px-2 hover:bg-red-50 border border-red-100 rounded-xl text-[10px] font-black uppercase tracking-wider text-red-500 flex items-center justify-center gap-1"
                        title="Dismiss Employee"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {isBn ? 'ডিলেট' : 'Del'}
                      </button>
                    </div>
                  </div>

                  {/* Absolute Badge for Print ID Badge */}
                    <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={async () => {
                          const btn = document.getElementById(`print-btn-${emp.id}`);
                          if (btn) btn.innerHTML = '<span class="animate-pulse">Generating...</span>';
                          
                          const idCardFront = document.getElementById(`id-card-front-${emp.id}`);
                          const idCardBack = document.getElementById(`id-card-back-${emp.id}`);
                          if (idCardFront && idCardBack) {
                            const originalFrontDisplay = idCardFront.style.display;
                            const originalBackDisplay = idCardBack.style.display;
                            
                            idCardFront.style.display = 'block';
                            idCardBack.style.display = 'flex'; // Restore flex layout
                            
                            try {
                              const canvasFront = await html2canvas(idCardFront, { scale: 5, useCORS: true, backgroundColor: '#ffffff', logging: false });
                              const linkFront = document.createElement('a');
                              linkFront.href = canvasFront.toDataURL('image/png', 1.0);
                              linkFront.download = `ID_Front_${emp.name.replace(/\s+/g, '_')}_HQ.png`;
                              linkFront.click();

                              const canvasBack = await html2canvas(idCardBack, { scale: 5, useCORS: true, backgroundColor: '#ffffff', logging: false });
                              const linkBack = document.createElement('a');
                              linkBack.href = canvasBack.toDataURL('image/png', 1.0);
                              linkBack.download = `ID_Back_${emp.name.replace(/\s+/g, '_')}_HQ.png`;
                              linkBack.click();
                            } catch (err) {
                              console.error("ID card download error", err);
                              alert("Sorry, there was an issue generating the ID card.");
                            } finally {
                              idCardFront.style.display = originalFrontDisplay;
                              idCardBack.style.display = originalBackDisplay;
                              if (btn) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg> HQ ID CARD';
                            }
                          }
                        }}
                        id={`print-btn-${emp.id}`}
                        className="p-1 px-2.5 bg-white shadow-md border hover:bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> HQ ID CARD
                      </button>
                    </div>

                    {/* Hidden ID badge printable structure - FRONT */}
                    <div 
                      id={`id-card-front-${emp.id}`} 
                      style={{
                        display: 'none',
                        width: '350px',
                        minHeight: '580px',
                        background: '#ffffff',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                        position: 'relative',
                        overflow: 'hidden',
                        fontFamily: "'Inter', sans-serif",
                        paddingBottom: '80px'
                      }}
                    >
                      {/* Top Red Shapes using pure CSS for html2canvas compatibility */}
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: '100%',
                        height: '240px',
                        background: 'linear-gradient(135deg, #e63946 0%, #b21f2d 100%)',
                        clipPath: 'polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%)',
                        zIndex: 0
                      }}></div>
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: '100%',
                        height: '245px',
                        background: 'rgba(230, 57, 70, 0.2)',
                        clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)',
                        zIndex: 0
                      }}></div>

                      <div style={{ position: 'relative', zIndex: 1, padding: '25px 15px 15px 15px', color: 'white' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontWeight: '900', fontSize: '20px', textAlign: 'center', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                              <div style={{background: 'white', padding: '5px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}}>
                                <img src={(settings as any).logoBase64 || (settings as any).logoUrl || "https://e7.pngegg.com/pngimages/922/926/png-clipart-islamic-calligraphy-desktop-arabic-calligraphy-bismillah-white-logo-thumbnail.png"} alt="Logo" style={{ width: '60px', height: '60px', objectFit: 'contain' }} crossOrigin="anonymous"/>
                              </div>
                              <span style={{textShadow: '0 2px 4px rgba(0,0,0,0.3)'}}>{(settings as any).name || 'BISMILLAH STORE'}</span>
                          </div>
                      </div>

                      {/* Hexagon Border/Photo using pure CSS borders and clip-path for html2canvas compatibility */}
                      <div style={{
                          width: '180px', 
                          height: '200px', 
                          background: 'linear-gradient(135deg, #111111 0%, #D4AF37 40%, #FFDF73 60%, #111111 100%)',
                          margin: '5px auto 15px auto',
                          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                          display: 'flex', 
                          justifyContent: 'center', 
                          alignItems: 'center',
                          position: 'relative',
                          zIndex: 2,
                      }}>
                          <img src={emp.photoUrl || "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT1JUUgjucKIHw5ATD788OLzTarRpNciei4S_qm5PAqRQ&s=10"} style={{
                              width: '168px', 
                              height: '188px', 
                              objectFit: 'cover',
                              background: '#f8f9fa',
                              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
                          }} alt="Employee" crossOrigin="anonymous" />
                      </div>

                      <div style={{ padding: '0 20px', textAlign: 'center', position: 'relative', zIndex: 2 }}>
                        <h2 style={{ margin: '0 0 5px 0', fontSize: '26px', color: '#111', fontWeight: 800, letterSpacing: '-0.5px' }}>{emp.name}</h2>
                        <div style={{ 
                            background: '#e63946', 
                            color: 'white', 
                            display: 'inline-block', 
                            padding: '6px 30px', 
                            fontWeight: 700, 
                            fontSize: '14px',
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                            marginTop: '5px',
                            borderRadius: '4px'
                        }}>
                            {emp.designation}
                        </div>
                      </div>

                      <div style={{ padding: '0 30px', marginTop: '30px', color: '#444' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'min-content 1fr', gap: '15px 10px', fontSize: '13px', fontWeight: 600, alignItems: 'center' }}>
                              <span style={{ color: '#888', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '1px' }}>ID&nbsp;No</span>
                              <strong style={{ fontSize: '15px', color: '#111' }}>{emp.id.substring(0, 8).toUpperCase()}</strong>
                              
                              <span style={{ color: '#888', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '1px' }}>Phone</span>
                              <strong style={{ fontSize: '14px', color: '#333' }}>{emp.phone || 'N/A'}</strong>
                              
                              <span style={{ color: '#888', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '1px' }}>Blood</span>
                              <strong style={{ fontSize: '16px', color: '#e63946' }}>{emp.bloodGroup || 'N/A'}</strong>
                              
                              <span style={{ color: '#888', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '1px' }}>Emg.</span>
                              <strong style={{ fontSize: '14px', color: '#333' }}>{emp.emergencyPhone || emp.phone || 'N/A'}</strong>
                          </div>
                      </div>

                      <div style={{ position: 'absolute', bottom: '0', left: '0', right: '0', background: '#f8f9fa', borderTop: '1px solid #e2e8f0', padding: '15px 0', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#64748b', letterSpacing: '0.5px' }}>CARD VALID TILL: 31ST DEC 2028</span>
                        </div>
                      </div>
                    </div>

                    {/* Hidden ID badge printable structure - BACK */}
                    <div 
                      id={`id-card-back-${emp.id}`} 
                      style={{
                        display: 'none',
                        width: '350px',
                        minHeight: '580px',
                        background: 'white',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                        position: 'relative',
                        overflow: 'hidden',
                        flexDirection: 'column',
                        fontFamily: 'sans-serif'
                      }}
                    >
                      <div style={{ background: '#e63946', height: '15px', width: '100%' }}></div>

                      <div style={{ padding: '30px 25px', flexGrow: 1, color: '#333' }}>
                          <h3 style={{ textAlign: 'center', color: '#e63946', marginTop: 0, textTransform: 'uppercase', fontSize: '18px', letterSpacing: '1px' }}>Terms & Conditions</h3>
                          
                          <div style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '20px', textAlign: 'justify' }}>
                              This card is the property of <strong style={{ textTransform: 'uppercase' }}>{(settings as any).name || 'BISMILLAH STORE'}</strong>. Use of this card is governed by company policy.
                              <ul style={{ paddingLeft: '18px', marginTop: '10px' }}>
                                  <li style={{ marginBottom: '8px' }}>This ID card must be worn and clearly visible at all times while on company premises.</li>
                                  <li style={{ marginBottom: '8px' }}>Do not lend, transfer, or alter this card in any way.</li>
                                  <li style={{ marginBottom: '8px' }}>Report loss or theft of this card immediately to the HR or Admin department.</li>
                                  <li style={{ marginBottom: '8px' }}>Must be surrendered upon termination of employment.</li>
                              </ul>
                          </div>

                          <div style={{ textAlign: 'center', margin: '25px 0' }}>
                              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent((((settings as any).website && (settings as any).website !== '') ? (settings as any).website : window.location.origin) + '/' + (((settings as any).name || 'company').replace(/\s+/g, '').toLowerCase()) + '/' + emp.id)}`} style={{ width: '90px', height: '90px', margin: '0 auto', border: '2px solid #333', padding: '5px', borderRadius: '8px', objectFit: 'contain' }} alt="QR Code" crossOrigin="anonymous" />
                          </div>
                      </div>

                      <div style={{ position: 'relative', marginTop: 'auto', textAlign: 'center', padding: '40px 20px 25px 20px', color: 'white', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '100%', background: '#e63946', clipPath: 'polygon(0 25%, 50% 0, 100% 25%, 100% 100%, 0 100%)', zIndex: 0 }}></div>
                          <div style={{ position: 'relative', zIndex: 1 }}>
                            <strong style={{ fontSize: '15px', display: 'block', marginBottom: '8px', letterSpacing: '0.5px' }}>If found, please return to:</strong>
                            <p style={{ margin: '4px 0', fontSize: '13px' }}>{((settings as any).name || 'Bismillah Store')} Head Office</p>
                            <p style={{ margin: '4px 0', fontSize: '13px' }}>{(settings as any).address || 'Dhaka, Bangladesh'}</p> 
                            <p style={{ margin: '4px 0', fontSize: '13px' }}>Phone: {(settings as any).phone || '+123-456-7890'}</p>
                            <p style={{ margin: '4px 0', fontSize: '13px' }}>Web: {((settings as any).website && (settings as any).website !== '') ? (settings as any).website : window.location.origin}</p>
                          </div>
                      </div>
                    </div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Attendance Tracker */}
      {activeTab === 'attendance_tracker' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                📅 {isBn ? 'হাজিরা ও ডিউটি শিফ্ট ওভারভিউ' : 'Attendance & Duty Shifts Overview'}
              </h3>
              <p className="text-[11px] text-gray-500 font-bold mt-1">
                {isBn 
                  ? 'দৈনিক হাজিরা হিসাব, ওভারটাইম ঘণ্টা ও কর্মীদের কর্মক্ষমতা রেকর্ড।' 
                  : 'Manage active attendance entries, records, and monthly logs.'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-2xl">
            <table className="w-full text-left text-xs text-gray-500 font-semibold">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-700 tracking-wider">
                <tr>
                  <th className="px-6 py-4">{isBn ? 'স্টাফের নাম' : 'Staff Profile'}</th>
                  <th className="px-6 py-4">{isBn ? 'যোগদানের তারিখ' : 'Joining Date'}</th>
                  <th className="px-6 py-4">{isBn ? 'আজকের ইন' : 'Check In'}</th>
                  <th className="px-6 py-4">{isBn ? 'আজকের আউট' : 'Check Out'}</th>
                  <th className="px-6 py-4">{isBn ? 'আজকের স্ট্যাটাস' : 'Attendance Status'}</th>
                  <th className="px-6 py-4">{isBn ? 'ওভারটাইম (ঘণ্টা)' : 'Overtime Hours'}</th>
                  <th className="px-6 py-4 text-right">{isBn ? 'অ্যাকশন' : 'Mark Absence'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {employees.map(emp => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const punch = attendanceLogs.find(log => log.employeeId === emp.id && log.date === todayStr);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <img src={emp.photoUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&h=256&fit=crop"} className="w-8 h-8 rounded-full object-cover border" alt="" />
                        <div>
                          <p className="font-bold text-gray-900">{emp.name}</p>
                          <p className="text-[10px] font-bold text-gray-400">{emp.designation}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-gray-650">{emp.joiningDate || '---'}</td>
                      <td className="px-6 py-4 font-mono font-bold text-gray-900">{punch?.checkIn || '---'}</td>
                      <td className="px-6 py-4 font-mono font-bold text-gray-900">{punch?.checkOut || '---'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          punch?.status === 'Present' 
                            ? 'bg-emerald-50 text-emerald-600' 
                            : punch?.status === 'Late' 
                            ? 'bg-amber-50 text-amber-600' 
                            : punch?.status === 'Absent' 
                            ? 'bg-red-50 text-red-600 font-extrabold'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {punch?.status || 'No entry today'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-extrabold text-indigo-650 inline-flex items-center gap-1.5 pt-4">
                        <span>{punch?.overtime || 0} Hrs</span>
                        <button
                          onClick={() => {
                            setAttendanceLogs(attendanceLogs.map(log => {
                              if (log.employeeId === emp.id && log.date === todayStr) {
                                return { ...log, overtime: (log.overtime || 0) + 1 };
                              }
                              return log;
                            }));
                            setNotification({ message: 'Overtime added', type: 'info' });
                          }}
                          className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-600 hover:text-white font-extrabold"
                          title="Add overtime hour"
                        >
                          +
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handlePunchAttendance(emp.id, 'Present')}
                            className="p-1 px-2.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 font-extrabold text-[10px] rounded"
                          >
                            P
                          </button>
                          <button
                            onClick={() => handlePunchAttendance(emp.id, 'Absent')}
                            className="p-1 px-2.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-600 font-extrabold text-[10px] rounded"
                          >
                            A
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Payroll Disbursal */}
      {activeTab === 'payroll_disbursal' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Payment calculator */}
            <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm md:col-span-5 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest border-b pb-2 flex items-center gap-1.5">
                🧮 {isBn ? 'বেতন স্লিপ ক্যালকুলেটর' : 'Salary Payout Calculator'}
              </h3>
              
              <div className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'স্টাফ নির্বাচন করুন' : 'Select Employee'}
                  </label>
                  <select
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:border-indigo-500"
                    value={payrollStaffId}
                    onChange={e => setPayrollStaffId(e.target.value)}
                  >
                    <option value="">{isBn ? '-- স্টাফ সিলেক্ট করুন --' : '-- Select Employee --'}</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.designation} - {emp.salary.toLocaleString()}{currencySymbol})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                      {isBn ? 'ওভারটাইম ঘন্টা' : 'Overtime Hours'}
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-black font-mono"
                      value={overtimeHours}
                      onChange={e => setOvertimeHours(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                      {isBn ? 'বিনা বেতনে ছুটি (দিন)' : 'Unpaid Leave (Days)'}
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-black font-mono"
                      value={unpaidDays}
                      onChange={e => setUnpaidDays(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'উৎসব ভাতা / বোনাস' : 'Festival Bonus Amount'}
                  </label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-black font-mono"
                    value={bonusAmount}
                    onChange={e => setBonusAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 font-sans">
                    {isBn ? 'প্রদানের মাস' : 'Month of Payout'}
                  </label>
                  <input
                    type="month"
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold"
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                  />
                </div>

                {computedSalaryDetails && (
                  <div className="bg-slate-50 p-4 rounded-2xl border space-y-2 text-xs">
                    <p className="font-bold text-gray-800 border-b pb-1.5 flex justify-between">
                      <span>👤 {computedSalaryDetails.empName} :</span>
                      <span>{computedSalaryDetails.empDesignation}</span>
                    </p>
                    <div className="flex justify-between font-semibold mt-1">
                      <span>{isBn ? 'মূল বেতন:' : 'Base Salary:'}</span>
                      <span className="font-mono text-slate-900 font-extrabold">{computedSalaryDetails.base.toLocaleString()}{currencySymbol}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>{isBn ? 'ওভারটাইম ভাতা:' : 'Overtime Pay:'}</span>
                      <span className="font-mono text-emerald-600 font-semibold">+{computedSalaryDetails.otPayout.toLocaleString()}{currencySymbol} <span className="text-[9px] font-bold">({computedSalaryDetails.otHours}h)</span></span>
                    </div>
                    {computedSalaryDetails.bonus > 0 && (
                      <div className="flex justify-between font-semibold">
                        <span>{isBn ? 'বোনাস/ভাতা:' : 'Bonus Payout:'}</span>
                        <span className="font-mono text-emerald-600 font-semibold">+{computedSalaryDetails.bonus.toLocaleString()}{currencySymbol}</span>
                      </div>
                    )}
                    {computedSalaryDetails.payoutDeductions > 0 && (
                      <div className="flex justify-between font-semibold text-red-500">
                        <span>{isBn ? 'ছুটি কর্তন:' : 'Leave Deductions:'}</span>
                        <span className="font-mono font-semibold">-{computedSalaryDetails.payoutDeductions.toLocaleString()}{currencySymbol} <span className="text-[9px] font-bold">({computedSalaryDetails.unpaidDaysCount}d)</span></span>
                      </div>
                    )}
                    <div className="border-t border-dashed border-gray-300 pt-2 flex justify-between font-black text-sm text-slate-900">
                      <span>{isBn ? 'সর্বমোট পরিশোধযোগ্য:' : 'Net Payable Amount:'}</span>
                      <span className="font-mono text-indigo-650 font-extrabold text-base">{computedSalaryDetails.netSalaryPayable.toLocaleString()}{currencySymbol}</span>
                    </div>

                    <button
                      onClick={handlePaySalary}
                      className="w-full mt-3 py-3 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                    >
                      💳 {isBn ? 'বেতন পাঠান এবং ক্যাশ লগ করুন' : 'Confirm & Disburse Salary'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Payout History register */}
            <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm md:col-span-7 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest border-b pb-2">
                📋 {isBn ? 'স্যালারি পেমেন্ট হিস্ট্রি' : 'Salary Disbursal Ledgers'}
              </h3>
              
              {payrollHistory.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-bold text-xs">
                  {isBn ? 'এখন পর্যন্ত কোনো ডিস্ট্রিবিউট রেকর্ড নেই!' : 'No payroll disbursal entries loaded.'}
                </div>
              ) : (
                <div className="divide-y divide-gray-105 space-y-2 max-h-[450px] overflow-y-auto pr-1">
                  {payrollHistory.map(pay => (
                    <div key={pay.id} className="py-3.5 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-xs font-black text-gray-900">{pay.employeeName}</p>
                        <p className="text-[10px] text-gray-500 font-bold">
                          {isBn ? 'পরিশোধের মাস:' : 'Month:'} <span className="bg-slate-100 rounded px-1.5 py-0.5 text-gray-700 font-mono font-bold">{pay.month}</span> | 💳 {pay.paymentMode}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs font-extrabold text-indigo-600 font-mono">
                            {pay.finalPay.toLocaleString()}{currencySymbol}
                          </p>
                          <p className="text-[9px] text-gray-400 font-bold">{pay.date}</p>
                        </div>

                        {/* Pay-Slip dynamic browser printing */}
                        <button
                          onClick={() => {
                            const slipId = `slip-${pay.id}`;
                            const slipNode = document.getElementById(slipId);
                            if (slipNode) {
                              const printW = window.open('', '_blank');
                              if (printW) {
                                printW.document.write(`
                                  <html>
                                  <head>
                                    <title>Salary Slip - ${pay.employeeName}</title>
                                    <style>
                                      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                                      body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; padding: 40px; }
                                      ${slipNode.getAttribute('style') || ''}
                                    </style>
                                  </head>
                                  <body onload="window.print(); window.close();">
                                    ${slipNode.outerHTML}
                                  </body>
                                  </html>
                                `);
                                printW.document.close();
                              }
                            }
                          }}
                          className="p-1.5 hover:bg-slate-150 bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 transition-colors"
                          title="Print Pay-Slip"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Printable Slip markup layout */}
                      <div 
                        id={`slip-${pay.id}`} 
                        className="hidden print:block w-[400px] border-4 border-slate-950 p-6 bg-white rounded-xl shadow-lg relative" 
                        style={{
                          width: '400px',
                          border: '4px solid #010101',
                          padding: '24px',
                          background: 'white',
                          fontFamily: "'Inter', sans-serif",
                          margin: 'auto',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                          <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: '#000', textTransform: 'uppercase' }}>
                            {settings.shopName || 'Merchant LLC'}
                          </h2>
                          <p style={{ fontSize: '10px', color: '#555', margin: '2px 0' }}>Corporate Pay-Slip Memorandum</p>
                        </div>
                        
                        <div style={{ width: '100%', borderBottom: '2px solid #000', marginBottom: '12px' }}></div>
                        
                        <table style={{ width: '100%', fontSize: '11px', marginBottom: '16px' }}>
                          <tbody>
                            <tr>
                              <td><strong>Employee:</strong></td>
                              <td style={{ textAlign: 'right' }}>{pay.employeeName}</td>
                            </tr>
                            <tr>
                              <td><strong>Disbursal Month:</strong></td>
                              <td style={{ textAlign: 'right', fontFamily: "'Courier New'" }}>{pay.month}</td>
                            </tr>
                            <tr>
                              <td><strong>Payment Mode:</strong></td>
                              <td style={{ textAlign: 'right' }}>{pay.paymentMode}</td>
                            </tr>
                            <tr>
                              <td><strong>Recorded Date:</strong></td>
                              <td style={{ textAlign: 'right' }}>{pay.date}</td>
                            </tr>
                          </tbody>
                        </table>

                        <div style={{ width: '100%', borderBottom: '1px dashed #000', marginBottom: '12px' }}></div>
                        
                        <div style={{ fontSize: '11px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span>Base Salary:</span>
                            <span style={{ fontFamily: "'Courier New'", fontWeight: 'bold' }}>{pay.baseSalary?.toLocaleString()}৳</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span>Festival Bonus:</span>
                            <span style={{ fontFamily: "'Courier New'", fontWeight: 'bold' }}>+{pay.bonus?.toLocaleString()}৳</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span>Absence Deductions:</span>
                            <span style={{ fontFamily: "'Courier New'", fontWeight: 'bold' }}>-{pay.deduction?.toLocaleString()}৳</span>
                          </div>
                          
                          <div style={{ width: '100%', borderBottom: '2px solid #000', marginTop: '8px', marginBottom: '8px' }}></div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 900 }}>
                            <span>Total Net payout:</span>
                            <span style={{ fontFamily: "'Courier New'", fontWeight: 900, color: '#000' }}>{pay.finalPay?.toLocaleString()}৳</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '80px', fontSize: '10px' }}>
                          <div style={{ borderTop: '1px solid #000', width: '120px', textAlign: 'center', paddingTop: '4px' }}>Employer Signature</div>
                          <div style={{ borderTop: '1px solid #000', width: '120px', textAlign: 'center', paddingTop: '4px' }}>Staff Signature</div>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Leaves & Holidays */}
      {activeTab === 'leave_planner' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Create Leave Request form */}
            <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm md:col-span-5 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest border-b pb-2">
                ✍️ {isBn ? 'ছুটির আবেদন ফরম' : 'Request Leave Form'}
              </h3>
              
              <form onSubmit={handleAddCustomLeaveRequest} className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'স্টাফ নির্বাচন' : 'Staff Member'}
                  </label>
                  <select
                    name="employeeId"
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">{isBn ? '-- মেম্বার নির্বাচন করুন --' : '-- Choose Employee --'}</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 font-sans">
                    {isBn ? 'ছুটির ধরণ' : 'Type of Leave'}
                  </label>
                  <select
                    name="leaveType"
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="Casual Leave">{isBn ? 'নৈমিত্তিক ছুটি (Casual Leave)' : 'Casual Leave'}</option>
                    <option value="Sick Leave">{isBn ? 'অসুস্থতাজনিত ছুটি (Sick Leave)' : 'Sick Leave'}</option>
                    <option value="Earned Leave">{isBn ? 'অর্জিত ছুটি (Earned Leave)' : 'Earned Leave'}</option>
                    <option value="Unpaid Leave">{isBn ? 'বিনা বেতনে ছুটি (Unpaid Leave)' : 'Unpaid Leave'}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                      {isBn ? 'শুরুর তারিখ' : 'Start Date'}
                    </label>
                    <input
                      name="startDate"
                      type="date"
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-1.5 text-xs font-bold font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 font-sans">
                      {isBn ? 'শেষের তারিখ' : 'End Date'}
                    </label>
                    <input
                      name="endDate"
                      type="date"
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-1.5 text-xs font-bold font-mono"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'ছুটির যৌক্তিক কারণ' : 'Reason for Leave'}
                  </label>
                  <textarea
                    name="reason"
                    rows={2}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-1.5 text-xs font-bold font-sans"
                    placeholder={isBn ? 'উদা: পারিবারিক অনুষ্ঠান' : 'e.g. medical appointments'}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-md shadow-indigo-600/15"
                >
                  <CirclePlus className="w-4 h-4" />
                  {isBn ? 'আবেদন জমা দিন' : 'Submit Application'}
                </button>
              </form>
            </div>

            {/* Leave Approvals list */}
            <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm md:col-span-7 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest border-b pb-2">
                📋 {isBn ? 'ছুটির আবেদন ও মূল্যায়ন' : 'Leave Verification & Requests'}
              </h3>
              
              {leaveRequests.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-bold text-xs">
                  {isBn ? 'কোনো ছুটির আবেদন নেই!' : 'No leave requests registered.'}
                </div>
              ) : (
                <div className="divide-y divide-gray-105 space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {leaveRequests.map(leave => (
                    <div key={leave.id} className="py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="space-y-1">
                        <p className="text-xs font-black text-gray-950">{leave.employeeName}</p>
                        <p className="text-[10px] text-gray-400 font-bold">
                          {leave.leaveType} | <span className="text-indigo-600 font-mono">{leave.daysCount} days</span> ({leave.startDate} - {leave.endDate})
                        </p>
                        <p className="text-[10.5px] text-gray-600 font-medium italic">
                          " {leave.reason} "
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {leave.status === 'Pending' ? (
                          <>
                            <button
                              onClick={() => handleApproveLeave(leave.id, 'Approved')}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white rounded text-[10px] font-black transition-all"
                            >
                              {isBn ? 'অনুমোদন' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleApproveLeave(leave.id, 'Rejected')}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-600 text-red-650 hover:text-white rounded text-[10px] font-black transition-all"
                            >
                              {isBn ? 'বাতিল' : 'Reject'}
                            </button>
                          </>
                        ) : (
                          <span className={`px-2.5 py-1 text-[10px] font-black rounded uppercase ${
                            leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                          }`}>
                            {leave.status === 'Approved' ? (isBn ? 'অনুমোদিত' : 'Approved') : (isBn ? 'প্রত্যাখ্যাত' : 'Rejected')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'system_login' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-4 gap-4">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Lock className="w-5 h-5 text-indigo-600" />
                  <span>{isBn ? 'সিস্টেম লগইন ও টার্মিনাল অ্যাক্সেস' : 'System Login & Access Control'}</span>
                </h3>
                <p className="text-xs font-medium text-slate-500 mt-1">
                  {isBn 
                    ? 'স্টাফ মেম্বারদের জন্য অ্যাপ্লিকেশনে লগইন করার অনুমতি এবং অ্যাক্সেস কন্ট্রোল সেট করুন।' 
                    : 'Manage application portal credentials, terminal lock-states, and roles for each registered staff member.'}
                </p>
              </div>
              <span className="text-[10px] font-black tracking-widest text-indigo-600 bg-indigo-50/70 px-3.5 py-1.5 rounded-xl uppercase">
                {isBn ? 'নিরাপত্তা প্যানেল' : 'Access Manager'}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/85 border-b border-gray-100">
                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">{isBn ? 'স্টাফ মেম্বার' : 'Staff Profile'}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">{isBn ? 'পদবি ও রোল' : 'Designation & Role'}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">{isBn ? 'ইউজারনেম এবং পিন নম্বর' : 'Credentials (Username & PIN)'}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">{isBn ? 'স্ট্যাটাস' : 'App Access Status'}</th>
                    <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-right">{isBn ? 'অ্যাকশন' : 'Access Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs font-bold text-slate-705">
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                        {isBn ? 'কোনো কর্মী ডাটাবেজে পাওয়া যায়নি!' : 'No registered staff members found to configure.'}
                      </td>
                    </tr>
                  ) : (
                    employees.map(emp => {
                      const loginPermitted = !!emp.allowLogin;
                      const creds = employeeLogins[emp.id] || { 
                        username: emp.username || '', 
                        password: emp.password || '' 
                      };

                      const getMappedRole = (designation: string): string => {
                        const d = designation.toLowerCase().trim();
                        if (d.includes('admin')) return 'admin';
                        if (d.includes('manager') && !d.includes('assistant') && !d.includes('sales')) return 'manager';
                        if (d.includes('assistant') && d.includes('manager')) return 'assistant_manager';
                        if (d.includes('sales') && d.includes('manager')) return 'sales_manager';
                        if (d.includes('warehouse') || d.includes('store')) return 'warehouse';
                        return 'sales_team';
                      };

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <img 
                                src={emp.photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&h=256&fit=crop'} 
                                alt={emp.name} 
                                className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-sm"
                              />
                              <div>
                                <h4 className="font-extrabold text-slate-900">{emp.name}</h4>
                                <span className="text-[10px] text-slate-400 font-mono">ID: EMP-{emp.id.substring(0, 5).toUpperCase()}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div>
                              <p className="text-slate-800 lowercase first-letter:uppercase font-extrabold text-xs">{emp.designation}</p>
                              <span className="text-[9px] font-black tracking-wider uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                                Role: {getMappedRole(emp.designation)}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-xs font-bold text-slate-700">
                            <div className="flex flex-col gap-2.5">
                              {/* Display the Shop Unique Code Section */}
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 bg-indigo-50/75 px-2.5 py-1 rounded-lg w-max font-bold border border-indigo-100/50 shadow-2xs">
                                  <span>{isBn ? 'দোকান কোড' : 'Shop Code'}:</span>
                                  <span className="font-mono font-black tracking-wider text-indigo-700">
                                    {(settings.shopCode || settings.shopId || '').toString().replace(/^SHP-/i, '').replace(/[^0-9]/g, '').slice(0, 6)}
                                  </span>
                                </div>
                                {!!emp.username && (
                                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50/90 px-2.5 py-1 rounded-lg w-max font-bold border border-emerald-100/50 shadow-2xs">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>{isBn ? 'সংরক্ষিত ইউজারনেম' : 'Username Locked'}</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-1.5">
                                {/* Username input field */}
                                <div className="flex items-center gap-2">
                                  <div className="relative w-44">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-extrabold select-none">@</span>
                                    <input
                                      type="text"
                                      value={creds.username}
                                      readOnly={!!emp.username}
                                      disabled={!!emp.username}
                                      onChange={(e) => {
                                        if (!!emp.username) return;
                                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
                                        setEmployeeLogins({
                                          ...employeeLogins,
                                          [emp.id]: { ...creds, username: val }
                                        });
                                      }}
                                      placeholder={isBn ? 'ইউজারনেম' : 'username'}
                                      className={`pl-5 pr-8 py-2 text-[11px] font-extrabold border rounded-xl transition-all w-full tracking-wide shadow-2xs ${
                                        !!emp.username 
                                          ? 'bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed select-none focus:outline-none focus:ring-0'
                                          : 'bg-white border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800'
                                      }`}
                                    />
                                    {!!emp.username && (
                                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2" title={isBn ? 'ইউজারনেম পরিবর্তন করা সম্ভব নয়' : 'Username is locked and cannot be changed'}>
                                        <Lock className="w-3 h-3 text-slate-400" />
                                      </span>
                                    )}
                                  </div>

                                  {!emp.username && (
                                    <button
                                      type="button"
                                      onClick={() => handleCreateUsername(emp)}
                                      disabled={isGeneratingUsername[emp.id]}
                                      className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100/85 active:bg-indigo-100 disabled:opacity-55 text-indigo-600 rounded-xl text-[10px] font-extrabold transition-all border border-indigo-100/60 shadow-2xs flex items-center justify-center min-w-[128px] cursor-pointer"
                                      title={isBn ? 'ইউজারনেম ও পিন জেনারেট করুন' : 'Generate Username & PIN'}
                                    >
                                      {isGeneratingUsername[emp.id] ? (isBn ? 'তৈরি হচ্ছে...' : 'Generating...') : (isBn ? 'ইউজারনেম তৈরি করুন' : 'Create Username')}
                                    </button>
                                  )}
                                </div>

                                {/* Password PIN field - Always upgradeable / editable */}
                                <div className="flex items-center gap-2">
                                  <div className="relative w-44">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] text-indigo-500 font-extrabold select-none tracking-widest">PIN</span>
                                    <input
                                      type="text"
                                      maxLength={6}
                                      value={creds.password}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        setEmployeeLogins({
                                          ...employeeLogins,
                                          [emp.id]: { ...creds, password: val }
                                        });
                                      }}
                                      placeholder={isBn ? '৬-ডিজিট পিন' : '6-digit PIN'}
                                      className="pl-9 pr-2.5 py-2 text-[11px] font-mono font-extrabold border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full text-slate-800 tracking-wider shadow-2xs transition-all"
                                    />
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-extrabold select-none italic min-w-[128px]">
                                    {isBn ? '✓ পাসওয়ার্ড যেকোনো সময় পরিবর্তনশীল' : '✓ PIN can be changed anytime'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              loginPermitted 
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                : 'bg-red-50 text-red-500 border border-red-100'
                            }`}>
                              {loginPermitted 
                                ? (isBn ? 'লগইন অনুমোদিত' : 'Access Granted') 
                                : (isBn ? 'লগইন বন্ধ' : 'Access Locked')}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleSaveCredentials(emp)}
                                disabled={isUpdatingCredentials[emp.id]}
                                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-[11px] font-black tracking-widest uppercase transition-all shadow-sm flex items-center justify-center min-w-[124px]"
                              >
                                {isUpdatingCredentials[emp.id] ? (isBn ? 'সেভ হচ্ছে...' : 'Saving...') : (isBn ? 'সেভ ও অনুমতি দিন' : 'Save & Grant')}
                              </button>
                              
                              {loginPermitted && (
                                <button
                                  onClick={() => handleLockAccess(emp)}
                                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-600 rounded-xl text-[11px] font-black tracking-widest uppercase transition-all"
                                >
                                  {isBn ? 'লক করুন' : 'Lock'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/75 flex items-start gap-4">
              <span className="text-lg">🔐</span>
              <div className="text-[11px] text-slate-500 font-medium leading-relaxed">
                <strong className="text-slate-800 font-bold block mb-1">{isBn ? 'টার্মিনাল সিকিউরিটি গাইডলাইন:' : 'Terminal Security Guideline:'}</strong>
                <span>
                  {isBn 
                    ? 'যেসব স্টাফের "লগইন অনুমোদিত" থাকবে, তারা তাদের নিবন্ধিত ফোন নম্বর এবং নির্ধারিত সাইনেপ ক্রেডেনশিয়াল ব্যবহার করে মূল পোর্টালে কাজের রেকর্ড পরিচালনা করতে পারবেন।' 
                    : 'Staff members with "Access Granted" can securely log in to their respective workspace terminals using their registered phone number credentials.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Certificate / Contracts generator */}
      {activeTab === 'employment_contracts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Form configuration panel */}
            <div className="bg-white p-6 rounded-3xl border border-gray-150/70 shadow-sm md:col-span-5 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest border-b pb-2 flex items-center justify-between">
                <span>📄 {isBn ? 'নথিপত্র জেনারেটর' : 'Document Generator Tool'}</span>
                <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider">A4 Layout</span>
              </h3>

              <div className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'কাগজপত্রের ধরণ' : 'Document Template Type'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCertType('contract')}
                      className={`py-2 px-3 text-xs font-black rounded-xl transition-all border ${
                        certType === 'contract' 
                          ? 'bg-slate-900 border-slate-950 text-white' 
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      📜 {isBn ? 'চুক্তিপত্র (Contract)' : 'Employment Contract'}
                    </button>
                    <button
                      onClick={() => setCertType('experience')}
                      className={`py-2 px-3 text-xs font-black rounded-xl transition-all border ${
                        certType === 'experience' 
                          ? 'bg-slate-900 border-slate-950 text-white' 
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      🏅 {isBn ? 'অভিজ্ঞতা সনদ' : 'Experience Release'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'স্টাফ মেম্বার নির্বাচন' : 'Staff Member Profile'}
                  </label>
                  <select
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:border-indigo-500"
                    value={selectedCertEmployee?.id || ''}
                    onChange={e => {
                      const emp = employees.find(em => em.id === e.target.value);
                      if (emp) setSelectedCertEmployee({ ...emp });
                    }}
                  >
                    <option value="">{isBn ? '-- মেম্বার সিলেট করুন --' : '-- Select Employee --'}</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                {certType === 'experience' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                          {isBn ? 'চাকরি শেষের তারিখ' : 'Release/Leaving Date'}
                        </label>
                        <input
                          type="date"
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-1.5 text-xs font-bold font-mono"
                          value={leavingDate}
                          onChange={e => setLeavingDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 font-sans">
                          {isBn ? 'ছাড়ার কারণ' : 'Reason for Leaving'}
                        </label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-1.5 text-xs font-bold"
                          value={leavingReason}
                          onChange={e => setLeavingReason(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                        {isBn ? 'প্রশংসা বা মন্তব্য' : 'Appraisal Comments'}
                      </label>
                      <textarea
                        rows={2}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-1.5 text-xs font-semibold"
                        value={certPraise}
                        onChange={e => setCertPraise(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {selectedCertEmployee && (
                  <button
                    onClick={() => {
                      const containerNode = document.getElementById('certificate-render-node');
                      if (containerNode) {
                        const printWin = window.open('', '_blank');
                        if (printWin) {
                          printWin.document.write(`
                            <html>
                            <head>
                              <title>${certType === 'contract' ? 'Agreement' : 'Certificate'}</title>
                              <style>
                                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Noto+Serif+Bengali:wght@400;700;900&display=swap');
                                body { font-family: 'Inter', 'Noto Serif Bengali', sans-serif; display: flex; justify-content: center; padding: 40px; margin: 0; background: #fff; }
                                #certificate-render-node {
                                  width: 595px;
                                  height: 842px;
                                  border: 12px double #1e1b4b;
                                  padding: 48px;
                                  background: white;
                                  font-family: 'Noto Serif Bengali', serif;
                                  display: flex;
                                  flex-direction: column;
                                  justify-content: space-between;
                                  box-sizing: border-box;
                                  text-align: center;
                                  color: #1e293b;
                                }
                              </style>
                            </head>
                            <body onload="window.print(); window.close();">
                              <div style="width: 800px; padding: 20px; display: flex; justify-content: center;">
                                ${containerNode.outerHTML}
                              </div>
                            </body>
                            </html>
                          `);
                          printWin.document.close();
                        }
                      }
                    }}
                    className="w-full py-3 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-md"
                  >
                    <Printer className="w-4 h-4 text-emerald-400" />
                    {isBn ? 'সরাসরি A4 প্রিন্ট আউট দিন' : 'Print A4 Certificate'}
                  </button>
                )}
              </div>
            </div>

            {/* A4 Live layout previewer */}
            <div className="bg-slate-50 p-6 rounded-3xl border border-gray-150/70 shadow-inner md:col-span-7 flex justify-center overflow-auto max-h-[550px]">
              {selectedCertEmployee ? (
                <div 
                  id="certificate-render-node" 
                  className="bg-white border-[12px] border-double border-indigo-900 p-12 text-center w-[595px] h-[842px] relative shadow-lg box-border flex flex-col justify-between" 
                  style={{
                    width: '595px',
                    height: '842px',
                    border: '12px double #1e1b4b',
                    padding: '48px',
                    background: 'white',
                    fontFamily: "'Noto Serif Bengali', serif",
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                    color: '#1e293b'
                  }}
                >
                  
                  {/* Bangladesh traditional patterns */}
                  <div>
                    <h5 style={{ fontSize: '11px', fontWeight: 'bold', margin: '0', letterSpacing: '2px' }}>بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ</h5>
                    <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#1e1b4b', textTransform: 'uppercase', margin: '12px 0 2px 0' }}>{settings.shopName || 'Merchant LLC'}</h2>
                    <p style={{ fontSize: '9px', margin: '0', fontFamily: 'Inter', letterSpacing: '1px', color: '#64748b' }}>{settings.shopPhone || 'Registered National Corporate Hub'}</p>
                    <div style={{ width: '80px', height: '3px', background: '#c2410c', margin: '12px auto' }}></div>
                  </div>

                  {certType === 'experience' ? (
                    /* INTERACTIVE EXPERIENCE CERTIFICATE */
                    <div style={{ flex: 1, margin: '48px 0', textAlign: 'left' }} className="text-left font-serif py-4">
                      
                      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                        <span style={{ fontSize: '16px', fontWeight: '950', textTransform: 'uppercase', background: '#1e1b4b', color: 'white', padding: '4px 16px', borderRadius: '4px' }}>{isBn ? 'অভিজ্ঞতা সনদপত্র' : 'CERTIFICATE OF EXPERIENCE'}</span>
                      </div>

                      <p style={{ fontSize: '11.5px', lineHeight: '1.8', textIndent: '30px' }} dangerouslySetInnerHTML={{
                        __html: isBn 
                          ? `ইহা অত্যন্ত আনন্দের সাথে প্রত্যয়ন করা যাইতেছে যে, <strong>${selectedCertEmployee.name}</strong>, যিনি দীর্ঘকাল যাবত আমাদের প্রতিষ্ঠানে অত্যন্ত নিষ্ঠা ও দক্ষতার সাথে <strong>${selectedCertEmployee.designation}</strong> পদে কর্মরত ছিলেন। তিনি আমাদের সংস্থায় যোগ দেন <strong>${selectedCertEmployee.joiningDate || '---'}</strong> তারিখে এবং শেষ কার্যদিবস ছিল <strong>${leavingDate}</strong>।`
                          : `This is to formally certify that <strong>${selectedCertEmployee.name}</strong> was actively employed at our esteemed enterprise as a dedicated <strong>${selectedCertEmployee.designation}</strong>. He officially joined our organization on <strong>${selectedCertEmployee.joiningDate || '---'}</strong> and successfully accomplished his tenure on <strong>${leavingDate}</strong>.`
                      }} />

                      <p style={{ fontSize: '11.5px', lineHeight: '1.8', textIndent: '30px', marginTop: '12px' }} dangerouslySetInnerHTML={{
                        __html: isBn
                          ? `কর্মকালীন সময়ে তাহার চারিত্রিক স্বভাব অত্যন্ত প্রশংসনীয় ছিল এবং তিনি কঠোর পরিশ্রমী ছিলেন। তাহার চলে যাওয়ার মূল কারণ: <strong>${leavingReason}</strong>। মন্তব্য: <em>"${certPraise}"</em>`
                          : `During his tenure, we found him highly motivated and loyal towards responsibilities. The primary reason for his graceful exit was: <strong>${leavingReason}</strong>. Appraisals comments: <em>"${certPraise}"</em>`
                      }} />

                      <p style={{ fontSize: '11.5px', lineHeight: '1.8', textIndent: '30px', marginTop: '12px' }}>
                        {isBn
                          ? `আমরা তাহার উজ্জ্বল ভবিষ্যৎ এবং সর্বাঙ্গীণ মঙ্গল কামনা করি।`
                          : `We sincerely wish him prosperity, health, and a magnificent future ahead in all professional domains.`
                        }
                      </p>
                    </div>
                  ) : (
                    /* INTERACTIVE CONTRACTS SHEET */
                    <div style={{ flex: 1, margin: '24px 0', textAlign: 'left' }} className="text-left font-serif py-1">
                      
                      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '950', textTransform: 'uppercase', background: '#0f172a', color: 'white', padding: '4px 16px', borderRadius: '4px' }}>{isBn ? 'কর্মসংস্থান চুক্তিপত্র' : 'NON-DISCLOSURE & EMPLOYMENT AGREEMENT'}</span>
                      </div>

                      <div style={{ fontSize: '10px', lineHeight: '1.6', color: '#334155' }}>
                        <p style={{ marginBottom: '8px' }}><strong>১. পক্ষসমূহ / Parties:</strong> এই চুক্তিপত্রটি <strong>{settings.shopName || 'Merchant LLC'}</strong> (মালিকপক্ষ) এবং জনাব/জনাবা <strong>{selectedCertEmployee.name}</strong> (কর্মীপক্ষ), পদবি: <strong>{selectedCertEmployee.designation}</strong>-এর মধ্যে সম্পাদিত হইল।</p>
                        <p style={{ marginBottom: '8px' }}><strong>২. বেতন ও শিফট / Remuneration:</strong> কর্মীপক্ষের প্রারম্ভিক মাসিক মূল বেতন হইবে <strong>{selectedCertEmployee.salary?.toLocaleString()}৳</strong> (বাংলাদেশী টাকা)। দৈনিক কর্মঘণ্টা হইবে: <strong>{selectedCertEmployee.schedule || '09:00 AM - 06:00 PM'}</strong>।</p>
                        <p style={{ marginBottom: '8px' }}><strong>৩. গোপনীয়তা / NDA Policy:</strong> কর্মী তাহার দায়িত্ব পালনের সময় প্রতিষ্ঠানের সমস্ত অভ্যন্তরীণ তথ্য, কাস্টমার ফোন তালিকা, এবং প্রযুক্তিগত মেথড সম্পূর্ণ গোপন রাখিতে বাধ্য থাকিবেন। কোনো তথ্য চুরি তথ্য ফাঁসের ক্ষেত্রে আইনি ব্যবস্থা নেয়া হইবে।</p>
                        <p style={{ marginBottom: '8px' }}><strong>৪. চাকরি অবসান / Release Rule:</strong> উভয় পক্ষই একে অপরকে অন্ততঃ ৩০ দিন পূর্বে নোটিশ প্রদান করিয়া চাকরির অবসান ঘটাইতে পারিবেন।</p>
                      </div>
                    </div>
                  )}

                  {/* Stamp & Seal placeholder signatures */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px', fontSize: '10.5px', fontFamily: "'Inter'", fontWeight: 'bold' }}>
                    <div>
                      <div style={{ borderTop: '1.5px solid #1e293b', width: '140px', textAlign: 'center', paddingTop: '4px' }}>{isBn ? 'নিয়োগকর্তার স্বাক্ষর' : 'Employer Signature'}</div>
                      <div style={{ fontSize: '8px', color: '#94a3b8', textAlign: 'center', marginTop: '2px' }}>Seal & Stamp</div>
                    </div>
                    <div>
                      <div style={{ borderTop: '1.5px solid #1e293b', width: '140px', textAlign: 'center', paddingTop: '4px' }}>{isBn ? 'কর্মীর অঙ্গীকার স্বাক্ষর' : 'Employee Acceptance'}</div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="text-center text-gray-400 font-bold text-xs py-20">
                  {isBn ? 'প্রিভিউ দেখতে একটি কর্মীর প্রোফাইল সিলেক্ট করুন!' : 'Select an employee from the dropdown list to see A4 PDF print preview here.'}
                </div>
              )}
            </div>

          </div>
        </div>
      )}


      {/* Adding / Editing Modal form details (Accessible via onAdd / onUpdate) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto max-h-screen">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 border border-gray-150 relative my-10 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                💼 {editingEmployee ? (isBn ? 'স্টাফ প্রোফাইল এডিট' : 'Edit Staff Profile') : (isBn ? 'নতুন স্টাফ যুক্ত করুন' : 'Register New Employee')}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 px-2.5 rounded-full hover:bg-slate-50 border text-slate-500 hover:text-slate-900 font-extrabold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'স্টাফের সম্পূর্ণ নাম' : 'Employee Full Name'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-bold"
                    placeholder={isBn ? 'উদা: আবুল কালাম' : 'e.g. Abul Kalam'}
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 font-sans">
                    {isBn ? 'পদবি (Designation/Position)' : 'Designation / Job Role'} <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="role"
                    required
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white text-slate-800 font-bold"
                    value={formData.designation || ''}
                    onChange={e => setFormData({ ...formData, designation: e.target.value })}
                  >
                    <option value="" disabled>
                      {isBn ? '-- নির্বাচন করুন --' : '-- Select Role --'}
                    </option>
                    {settings?.businessType === 'Restaurant' ? (
                      <>
                        <option value="waiter">{isBn ? 'ওয়েটার (Waiter)' : 'Waiter'}</option>
                        <option value="manager">{isBn ? 'ম্যানেজার (Manager)' : 'Manager'}</option>
                        <option value="chef">{isBn ? 'শেফ (Chef)' : 'Chef'}</option>
                      </>
                    ) : (
                      <>
                        <option value="manager">{isBn ? 'ম্যানেজার (Manager)' : 'Manager'}</option>
                        <option value="assistant_manager">{isBn ? 'সহকারী ম্যানেজার (Assistant Manager)' : 'Assistant Manager'}</option>
                        <option value="sales_manager">{isBn ? 'সেলস ম্যানেজার (Sales Manager)' : 'Sales Manager'}</option>
                        <option value="sales_team">{isBn ? 'সেলস টিম (Sales Team)' : 'Sales Team'}</option>
                        <option value="warehouse">{isBn ? 'ওয়ারহাউজ (Warehouse)' : 'Warehouse'}</option>
                      </>
                    )}
                    {formData.designation && !['manager', 'assistant_manager', 'sales_manager', 'sales_team', 'warehouse', 'waiter', 'chef'].includes(formData.designation) && (
                      <option value={formData.designation}>{formData.designation}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'শাখা বরাদ্দ করুন (Assign Branch)' : 'Assign Branch'} <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white text-slate-800 font-bold"
                    value={formData.branchId || ''}
                    onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                  >
                    <option value="" disabled>
                      {isBn ? '-- শাখা নির্বাচন করুন --' : '-- Select Branch --'}
                    </option>
                    {branches && branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'মোবাইল নম্বর' : 'Phone Number'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    placeholder="017xxxxxxxx"
                    value={formData.phone || ''}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'ইমেইল এড্রেস (ঐচ্ছিক)' : 'Email Address (Optional)'}
                  </label>
                  <input
                    type="email"
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    placeholder="example@mail.com"
                    value={formData.email || ''}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'মাসিক মূল বেতন' : 'Monthly Basic Salary (৳)'}
                  </label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-black font-mono"
                    value={formData.salary || 12000}
                    onChange={e => setFormData({ ...formData, salary: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'ডিউটি শিফট / সময়' : 'Duty Hours / Schedule'}
                  </label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    placeholder="09:00 AM - 06:00 PM"
                    value={formData.schedule || ''}
                    onChange={e => setFormData({ ...formData, schedule: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'যোগদানের তারিখ' : 'Joining Date'}
                  </label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    value={formData.joiningDate || ''}
                    onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'রক্তের গ্রুপ' : 'Blood Group'}
                  </label>
                  <select
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold"
                    value={formData.bloodGroup || 'O+'}
                    onChange={e => setFormData({ ...formData, bloodGroup: e.target.value })}
                  >
                    <option value="A+">A+</option>
                    <option value="B+">B+</option>
                    <option value="AB+">AB+</option>
                    <option value="O+">O+</option>
                    <option value="A-">A-</option>
                    <option value="B-">B-</option>
                    <option value="AB-">AB-</option>
                    <option value="O-">O-</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 font-sans">
                    {isBn ? 'জরুরি যোগাযোগ নাম্বর' : 'Emergency Contact No'}
                  </label>
                  <input
                    type="tel"
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    placeholder="01xxxxxxxxx"
                    value={formData.emergencyPhone || ''}
                    onChange={e => setFormData({ ...formData, emergencyPhone: e.target.value })}
                  />
                </div>

                <div className="col-span-1 md:col-span-2 bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 transition-colors duration-200">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-2 font-sans">
                    {isBn ? 'কর্মচারীর ছবি (ফটো আপলোড / ড্র্যাগ অ্যান্ড ড্রপ / ইউআরএল)' : 'Employee Photo (Upload / Drag & Drop / URL)'}
                  </label>
                  
                  <div className="flex flex-col md:flex-row items-stretch gap-4">
                    {/* Left side: Drag & Drop click zone / preview */}
                    <div 
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => {
                        setIsDragging(false);
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          const file = e.dataTransfer.files[0];
                          try {
                            const base64 = await fileToBase64(file);
                            setFormData((prev) => ({ ...prev, photoUrl: base64 }));
                            setNotification({ message: isBn ? 'ছবি সফলভাবে যুক্ত করা হয়েছে!' : 'Photo added successfully!', type: 'success' });
                          } catch (err) {
                            setNotification({ message: isBn ? 'ছবি প্রসেস করা সম্ভব হয়নি!' : 'Failed to process photo!', type: 'error' });
                          }
                        }
                      }}
                      onClick={() => {
                        document.getElementById('profile-photo-uploader')?.click();
                      }}
                      className={`relative flex-1 min-h-[100px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-3 cursor-pointer select-none transition-all duration-200 ${
                        isDragging 
                          ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' 
                          : 'border-slate-300 bg-white hover:bg-slate-100/55'
                      }`}
                    >
                      <input 
                        type="file" 
                        id="profile-photo-uploader" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            try {
                              const base64 = await fileToBase64(file);
                              setFormData((prev) => ({ ...prev, photoUrl: base64 }));
                              setNotification({ message: isBn ? 'ছবি সফলভাবে যুক্ত করা হয়েছে!' : 'Photo added successfully!', type: 'success' });
                            } catch (err) {
                              setNotification({ message: isBn ? 'ছবি প্রসেস করা সম্ভব হয়নি!' : 'Failed to process photo!', type: 'error' });
                            }
                          }
                        }}
                      />
                      
                      {formData.photoUrl && (formData.photoUrl.startsWith('data:image/') || formData.photoUrl.startsWith('http://') || formData.photoUrl.startsWith('https://')) ? (
                        <div className="flex items-center gap-3">
                          <img 
                            src={formData.photoUrl} 
                            alt="Preview" 
                            className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-left">
                            <p className="text-xs font-bold text-slate-800">{isBn ? 'ছবি সংযুক্ত হয়েছে' : 'Photo Connected'}</p>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormData((prev) => ({ ...prev, photoUrl: '' }));
                              }}
                              className="text-[10px] text-red-500 hover:underline font-bold mt-0.5"
                            >
                              {isBn ? 'মুছে ফেলুন' : 'Remove Photo'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                          <p className="text-xs font-bold text-slate-600">
                            {isBn ? 'ড্রপ করুন অথবা সিলেক্ট করুন' : 'Drop file here or touch to upload'}
                          </p>
                          <p className="text-[9px] text-gray-400 mt-0.5">
                            {isBn ? 'সহজ ড্র্যাগ অ্যান্ড ড্রপ পদ্ধতি' : 'Simpler drag and drop click method'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right side: URL input */}
                    <div className="flex-1 w-full flex flex-col justify-center">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 font-sans">
                        {isBn ? 'অথবা ছবির ইউআরএল দিন' : 'Or input Photo URL directly'}
                      </label>
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-750"
                        placeholder="https://images.unsplash.com/..."
                        value={formData.photoUrl?.startsWith('data:image') ? '' : formData.photoUrl || ''}
                        onChange={e => setFormData({ ...formData, photoUrl: e.target.value })}
                      />
                      <p className="text-[9px] text-slate-400 mt-1.5 font-sans leading-relaxed">
                        {isBn ? '* যদি কোনো ছবি সরাসরি ক্যাশ আপলোড করতে চান তবে বাম পাশের আপলোড ব্যবহার করুন।' : '* For convenient database synchronization, uploading files directly converts them to highly optimized lightweight Base64.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    {isBn ? 'বেতন প্রদানের মাধ্যম' : 'Payment Disbursal Mode'}
                  </label>
                  <select
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold"
                    value={formData.paymentMode || 'cash'}
                    onChange={e => setFormData({ ...formData, paymentMode: e.target.value as any })}
                  >
                    <option value="cash">{isBn ? 'হাত ক্যাশ (Cash in Hand)' : 'Cash in Hand'}</option>
                    <option value="bank">{isBn ? 'ব্যাংক একাউন্ট (Bank Account)' : 'Bank Account'}</option>
                    <option value="mfs">{isBn ? 'এমএফএস ওয়ালেট (bKash/Nagad)' : 'MFS Wallet (bKash/Nagad)'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 font-sans">
                    {isBn ? 'স্টাফ স্ট্যাটাস' : 'Employment Status'}
                  </label>
                  <select
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold"
                    value={formData.status || 'active'}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="col-span-1 md:col-span-2 bg-indigo-50/40 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between gap-4 mt-2">
                  <div>
                    <label className="text-xs font-black text-indigo-950 block mb-1">
                      {isBn ? 'সিস্টেম লগইন অনুমতি দিন?' : 'Allow System Login?'}
                    </label>
                    <p className="text-[10px] text-indigo-700 leading-relaxed max-w-md">
                      {isBn 
                        ? 'সক্রিয় করলে এই কর্মচারী তার ইমেইল দিয়ে সিস্টেমে লগইন করে ড্যাশবোর্ড অ্যাক্সেস করতে পারবে।' 
                        : 'If enabled, this staff member can use their email to sign in and access designated areas.'}
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, allowLogin: !prev.allowLogin }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        formData.allowLogin ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          formData.allowLogin ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

              </div>

              <div className="flex gap-3 justify-end border-t pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-6 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors uppercase tracking-wider"
                >
                  {isBn ? 'ফিরে যান' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-950 text-white rounded-xl font-black transition-colors uppercase tracking-wider flex items-center gap-1.5"
                >
                  {isBn ? 'সংরক্ষণ করুন' : 'Save Employee'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

    </div>
  );
}
