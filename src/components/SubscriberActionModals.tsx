import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  RefreshCw,
  Power,
  Edit2,
  Trash2,
  Printer,
  Download,
  Copy,
  Layers,
  Zap,
  CheckCircle2,
  Users,
  UserPlus,
  FileDown
} from 'lucide-react';
import { HotspotUser, PPPSecret, UsermanUser, HotspotProfile, PPPProfile, UsermanProfile } from '../types/mikrotik';
import { SubscriberSystem } from './SubscribersManagerView';

export type ActionModalType =
  | 'add'
  | 'edit'
  | 'change_profile'
  | 'renew'
  | 'toggle_status'
  | 'disconnect'
  | 'print_export'
  | 'delete'
  | null;

interface SubscriberActionModalsProps {
  modalType: ActionModalType;
  onClose: () => void;
  selectedIds: string[];
  system: SubscriberSystem;
  hotspotUsers: HotspotUser[];
  pppSecrets: PPPSecret[];
  usermanUsers: UsermanUser[];
  hotspotProfiles: HotspotProfile[];
  pppProfiles: PPPProfile[];
  usermanProfiles: UsermanProfile[];
  onExecuteAddSubscriber?: (system: SubscriberSystem, data: any) => Promise<any>;
  onExecuteEditSingleHotspot: (id: string, data: Partial<HotspotUser>) => Promise<any>;
  onExecuteEditSinglePPP: (id: string, data: Partial<PPPSecret>) => Promise<any>;
  onExecuteEditSingleUserman: (id: string, data: Partial<UsermanUser>) => Promise<any>;
  onExecuteBatchChangeProfile: (newProfile: string, resetLimits: boolean) => Promise<any>;
  onExecuteBatchRenew: (resetUptime: boolean, resetBytes: boolean, enableAccount: boolean) => Promise<any>;
  onExecuteBatchToggleStatus: (enable: boolean, kickActive: boolean) => Promise<any>;
  onExecuteBatchDisconnect: () => Promise<any>;
  onExecuteBatchDelete: () => Promise<any>;
  onExecuteBatchEdit?: (data: any) => Promise<any>;
  onNavigateToPrint?: (users: any[]) => void;
  onExportCsv?: (users: any[]) => void;
  onExportPdf?: (users: any[]) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const SubscriberActionModals: React.FC<SubscriberActionModalsProps> = ({
  modalType,
  onClose,
  selectedIds,
  system,
  hotspotUsers,
  pppSecrets,
  usermanUsers,
  hotspotProfiles,
  pppProfiles,
  usermanProfiles,
  onExecuteAddSubscriber,
  onExecuteEditSingleHotspot,
  onExecuteEditSinglePPP,
  onExecuteEditSingleUserman,
  onExecuteBatchChangeProfile,
  onExecuteBatchRenew,
  onExecuteBatchToggleStatus,
  onExecuteBatchDisconnect,
  onExecuteBatchDelete,
  onExecuteBatchEdit,
  onNavigateToPrint,
  onExportCsv,
  onExportPdf,
  showToast
}) => {
  const selectedIdSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedIdLowerSet = React.useMemo(() => new Set(selectedIds.map((id) => String(id).toLowerCase())), [selectedIds]);

  // Selected entities resolution with O(1) Set ID and Name matching
  const selectedHotspot = React.useMemo(
    () =>
      hotspotUsers.filter(
        (u) =>
          selectedIdSet.has(u.id) ||
          selectedIdSet.has((u as any)['.id']) ||
          (u.name && selectedIdLowerSet.has(u.name.toLowerCase()))
      ),
    [hotspotUsers, selectedIdSet, selectedIdLowerSet]
  );

  const selectedPPP = React.useMemo(
    () =>
      pppSecrets.filter(
        (s) =>
          selectedIdSet.has(s.id) ||
          selectedIdSet.has((s as any)['.id']) ||
          (s.name && selectedIdLowerSet.has(s.name.toLowerCase()))
      ),
    [pppSecrets, selectedIdSet, selectedIdLowerSet]
  );

  const selectedUserman = React.useMemo(
    () =>
      usermanUsers.filter(
        (u) =>
          selectedIdSet.has(u.id) ||
          selectedIdSet.has((u as any)['.id']) ||
          (u.name && selectedIdLowerSet.has(u.name.toLowerCase()))
      ),
    [usermanUsers, selectedIdSet, selectedIdLowerSet]
  );

  const selectedNames = React.useMemo(
    () =>
      system === 'hotspot'
        ? selectedHotspot.length > 0
          ? selectedHotspot.map((u) => u.name || u.id)
          : selectedIds
        : system === 'pppoe'
        ? selectedPPP.length > 0
          ? selectedPPP.map((s) => s.name || s.id)
          : selectedIds
        : selectedUserman.length > 0
        ? selectedUserman.map((u) => u.name || u.id)
        : selectedIds,
    [system, selectedHotspot, selectedPPP, selectedUserman, selectedIds]
  );

  // States for Profile Change
  const currentProfiles = React.useMemo(
    () => (system === 'hotspot' ? hotspotProfiles : system === 'pppoe' ? pppProfiles : usermanProfiles),
    [system, hotspotProfiles, pppProfiles, usermanProfiles]
  );
  const [targetProfile, setTargetProfile] = useState<string>(currentProfiles[0]?.name || 'default');
  const [resetLimitsOnProfileChange, setResetLimitsOnProfileChange] = useState<boolean>(true);

  // States for Renew
  const [renewResetUptime, setRenewResetUptime] = useState<boolean>(true);
  const [renewResetBytes, setRenewResetBytes] = useState<boolean>(true);
  const [renewEnableAccount, setRenewEnableAccount] = useState<boolean>(true);

  // States for Status Toggle
  const [targetStatusAction, setTargetStatusAction] = useState<'enable' | 'disable'>('enable');
  const [kickActiveOnDisable, setKickActiveOnDisable] = useState<boolean>(true);

  // Single Edit User States (if 1 selected)
  const singleHs = selectedHotspot[0];
  const singlePpp = selectedPPP[0];
  const singleUm = selectedUserman[0];

  const [editHsName, setEditHsName] = useState(singleHs?.name || selectedIds[0] || '');
  const [editHsPassword, setEditHsPassword] = useState(singleHs?.password || '');
  const [editHsProfile, setEditHsProfile] = useState(singleHs?.profile || hotspotProfiles[0]?.name || 'default');
  const [editHsLimitUptime, setEditHsLimitUptime] = useState(singleHs?.limitUptime || '');
  const [editHsLimitBytesMb, setEditHsLimitBytesMb] = useState<number>(
    singleHs?.limitBytesTotal ? Math.round(singleHs.limitBytesTotal / (1024 * 1024)) : 0
  );
  const [editHsMacAddress, setEditHsMacAddress] = useState(singleHs?.macAddress || '');
  const [editHsComment, setEditHsComment] = useState(singleHs?.comment || '');
  const [editHsPrice, setEditHsPrice] = useState<number>(singleHs?.price || 0);
  const [editHsDisabled, setEditHsDisabled] = useState(singleHs?.disabled || false);

  // PPP Edit states
  const [editPppName, setEditPppName] = useState(singlePpp?.name || '');
  const [editPppPassword, setEditPppPassword] = useState(singlePpp?.password || '');
  const [editPppService, setEditPppService] = useState(singlePpp?.service || 'pppoe');
  const [editPppProfile, setEditPppProfile] = useState(singlePpp?.profile || pppProfiles[0]?.name || 'default');
  const [editPppLocalAddress, setEditPppLocalAddress] = useState(singlePpp?.localAddress || '');
  const [editPppRemoteAddress, setEditPppRemoteAddress] = useState(singlePpp?.remoteAddress || '');
  const [editPppComment, setEditPppComment] = useState(singlePpp?.comment || '');
  const [editPppDisabled, setEditPppDisabled] = useState(singlePpp?.disabled || false);

  // Userman Edit states
  const [editUmName, setEditUmName] = useState(singleUm?.name || '');
  const [editUmPassword, setEditUmPassword] = useState(singleUm?.password || '');
  const [editUmCustomer, setEditUmCustomer] = useState(singleUm?.customer || 'admin');
  const [editUmProfile, setEditUmProfile] = useState(singleUm?.profile || usermanProfiles[0]?.name || 'default');
  const [editUmSharedUsers, setEditUmSharedUsers] = useState<number>(singleUm?.sharedUsers || 1);
  const [editUmValidity, setEditUmValidity] = useState(singleUm?.validity || '30d');
  const [editUmLimitUptime, setEditUmLimitUptime] = useState(singleUm?.limitUptime || '');
  const [editUmLimitBytesMb, setEditUmLimitBytesMb] = useState<number>(
    singleUm?.limitBytesTotal ? Math.round(singleUm.limitBytesTotal / (1024 * 1024)) : 0
  );
  const [editUmPrice, setEditUmPrice] = useState<number>(singleUm?.price || 0);
  const [editUmComment, setEditUmComment] = useState(singleUm?.comment || '');
  const [editUmDisabled, setEditUmDisabled] = useState<boolean>(Boolean(singleUm?.disabled || singleUm?.state === 'disabled'));
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');

  // Batch edit explicit apply toggles (prevents accidentally wiping untouched fields across multiple users)
  const [batchApplyProfile, setBatchApplyProfile] = useState(false);
  const [batchApplyLimits, setBatchApplyLimits] = useState(false);
  const [batchApplyComment, setBatchApplyComment] = useState(false);
  const [batchApplyDisabled, setBatchApplyDisabled] = useState(false);
  const [batchApplyService, setBatchApplyService] = useState(false);
  const [batchApplyAddresses, setBatchApplyAddresses] = useState(false);

  // Add Subscriber Form State
  const [addName, setAddName] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addSameUserPass, setAddSameUserPass] = useState(true);
  const [addProfile, setAddProfile] = useState('');
  const [addService, setAddService] = useState('pppoe');
  const [addLimitUptime, setAddLimitUptime] = useState('');
  const [addLimitBytesMb, setAddLimitBytesMb] = useState<number>(0);
  const [addMacAddress, setAddMacAddress] = useState('');
  const [addLocalAddress, setAddLocalAddress] = useState('');
  const [addRemoteAddress, setAddRemoteAddress] = useState('');
  const [addCustomer, setAddCustomer] = useState('admin');
  const [addComment, setAddComment] = useState('');
  const [addPrice, setAddPrice] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const isMountedRef = React.useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync state cleanly whenever modal opens or system switches
  useEffect(() => {
    if (!modalType) return;
    setDeleteConfirmText('');

    const defaultProf = currentProfiles[0]?.name || 'default';

    if (modalType === 'add') {
      setAddName('');
      setAddPassword('');
      setAddSameUserPass(true);
      setAddProfile(defaultProf);
      setAddService('pppoe');
      setAddLimitUptime('');
      setAddLimitBytesMb(0);
      setAddMacAddress('');
      setAddLocalAddress('');
      setAddRemoteAddress('');
      setAddCustomer('admin');
      setAddComment('');
      setAddPrice(Number((currentProfiles[0] as any)?.price) || 0);
    } else if (modalType === 'change_profile') {
      setTargetProfile(defaultProf);
      setResetLimitsOnProfileChange(true);
    } else if (modalType === 'toggle_status') {
      const selectedEntities =
        system === 'hotspot' ? selectedHotspot : system === 'pppoe' ? selectedPPP : selectedUserman;
      const disabledCount = selectedEntities.filter((u: any) => Boolean(u?.disabled || u?.state === 'disabled')).length;
      setTargetStatusAction(disabledCount > selectedEntities.length / 2 ? 'enable' : 'disable');
      setKickActiveOnDisable(true);
    } else if (modalType === 'edit') {
      setBatchApplyProfile(false);
      setBatchApplyLimits(false);
      setBatchApplyComment(false);
      setBatchApplyDisabled(false);
      setBatchApplyService(false);
      setBatchApplyAddresses(false);

      if (system === 'hotspot') {
        if (selectedIds.length === 1 && singleHs) {
          setEditHsName(singleHs.name || '');
          setEditHsPassword(singleHs.password || '');
          setEditHsProfile(singleHs.profile || hotspotProfiles[0]?.name || 'default');
          setEditHsLimitUptime(singleHs.limitUptime || '');
          setEditHsLimitBytesMb(singleHs.limitBytesTotal ? Math.round(singleHs.limitBytesTotal / (1024 * 1024)) : 0);
          setEditHsMacAddress(singleHs.macAddress || '');
          setEditHsComment(singleHs.comment || '');
          setEditHsPrice(singleHs.price || 0);
          setEditHsDisabled(Boolean(singleHs.disabled));
        } else {
          setEditHsProfile(hotspotProfiles[0]?.name || 'default');
          setEditHsLimitUptime('');
          setEditHsLimitBytesMb(0);
          setEditHsComment('');
          setEditHsPrice(0);
          setEditHsDisabled(false);
        }
      } else if (system === 'pppoe') {
        if (selectedIds.length === 1 && singlePpp) {
          setEditPppName(singlePpp.name || '');
          setEditPppPassword(singlePpp.password || '');
          setEditPppService(singlePpp.service || 'pppoe');
          setEditPppProfile(singlePpp.profile || pppProfiles[0]?.name || 'default');
          setEditPppLocalAddress(singlePpp.localAddress || '');
          setEditPppRemoteAddress(singlePpp.remoteAddress || '');
          setEditPppComment(singlePpp.comment || '');
          setEditPppDisabled(Boolean(singlePpp.disabled));
        } else {
          setEditPppService('pppoe');
          setEditPppProfile(pppProfiles[0]?.name || 'default');
          setEditPppLocalAddress('');
          setEditPppRemoteAddress('');
          setEditPppComment('');
          setEditPppDisabled(false);
        }
      } else if (system === 'userman') {
        if (selectedIds.length === 1 && singleUm) {
          setEditUmName(singleUm.name || '');
          setEditUmPassword(singleUm.password || '');
          setEditUmCustomer(singleUm.customer || 'admin');
          setEditUmProfile(singleUm.profile || usermanProfiles[0]?.name || 'default');
          setEditUmSharedUsers(singleUm.sharedUsers || 1);
          setEditUmValidity(singleUm.validity || '30d');
          setEditUmLimitUptime(singleUm.limitUptime || '');
          setEditUmLimitBytesMb(singleUm.limitBytesTotal ? Math.round(singleUm.limitBytesTotal / (1024 * 1024)) : 0);
          setEditUmPrice(singleUm.price || 0);
          setEditUmComment(singleUm.comment || '');
          setEditUmDisabled(Boolean(singleUm.disabled || singleUm.state === 'disabled'));
        } else {
          setEditUmProfile(usermanProfiles[0]?.name || 'default');
          setEditUmCustomer('admin');
          setEditUmComment('');
          setEditUmPrice(0);
          setEditUmDisabled(false);
        }
      }
    }
  }, [modalType, system, selectedIds, singleHs, singlePpp, singleUm, currentProfiles, hotspotProfiles, pppProfiles, usermanProfiles, selectedHotspot, selectedPPP, selectedUserman]);

  // Early null return MUST come AFTER all hooks to satisfy React Rules of Hooks
  if (!modalType || (modalType !== 'add' && selectedIds.length === 0)) return null;

  // Handlers
  const handleConfirmAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      showToast('اسم المشترك مطلوب', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      if (onExecuteAddSubscriber) {
        if (system === 'hotspot') {
          const prof = addProfile || (hotspotProfiles[0]?.name || 'default');
          const effectivePass = (addSameUserPass || !addPassword) ? addName.trim() : addPassword;
          await onExecuteAddSubscriber('hotspot', {
            name: addName.trim(),
            password: effectivePass,
            profile: prof,
            limitUptime: addLimitUptime.trim(),
            limitBytesTotal: addLimitBytesMb > 0 ? Math.round(addLimitBytesMb * 1024 * 1024) : 0,
            macAddress: addMacAddress.trim(),
            comment: addComment.trim(),
            price: addPrice
          });
        } else if (system === 'pppoe') {
          const prof = addProfile || (pppProfiles[0]?.name || 'default');
          const effectivePass = (addSameUserPass || !addPassword) ? addName.trim() : addPassword;
          await onExecuteAddSubscriber('pppoe', {
            name: addName.trim(),
            password: effectivePass,
            service: addService || 'pppoe',
            profile: prof,
            localAddress: addLocalAddress.trim(),
            remoteAddress: addRemoteAddress.trim(),
            comment: addComment.trim()
          });
        } else if (system === 'userman') {
          const prof = addProfile || (usermanProfiles[0]?.name || 'default');
          const effectivePass = (addSameUserPass || !addPassword) ? addName.trim() : addPassword;
          await onExecuteAddSubscriber('userman', {
            name: addName.trim(),
            password: effectivePass,
            customer: addCustomer.trim() || 'admin',
            profile: prof,
            comment: addComment.trim(),
            price: addPrice
          });
        }
      }
      onClose();
    } catch (e: any) {
      if (!e?.isDebouncedCancelled) {
        showToast(e?.message || 'حدث خطأ أثناء إضافة المشترك', 'error');
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  // Handlers with precise execution feedback, proper async flow & verified completion
  const handleConfirmChangeProfile = async () => {
    setIsProcessing(true);
    try {
      await onExecuteBatchChangeProfile(targetProfile, resetLimitsOnProfileChange);
      onClose();
    } catch (e: any) {
      if (!e?.isDebouncedCancelled) {
        showToast(e?.message || 'حدث خطأ أثناء نقل البروفايل للمشتركين على المايكروتك', 'error');
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  const handleConfirmRenew = async () => {
    setIsProcessing(true);
    try {
      await onExecuteBatchRenew(renewResetUptime, renewResetBytes, renewEnableAccount);
      onClose();
    } catch (e: any) {
      if (!e?.isDebouncedCancelled) {
        showToast(e?.message || 'حدث خطأ أثناء تجديد وتصفير المشتركين على المايكروتك', 'error');
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  const handleConfirmToggleStatus = async () => {
    setIsProcessing(true);
    try {
      await onExecuteBatchToggleStatus(targetStatusAction === 'enable', kickActiveOnDisable);
      onClose();
    } catch (e: any) {
      if (!e?.isDebouncedCancelled) {
        showToast(e?.message || 'حدث خطأ أثناء تعديل حالة المشتركين على المايكروتك', 'error');
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  const handleConfirmDisconnect = async () => {
    setIsProcessing(true);
    try {
      await onExecuteBatchDisconnect();
      onClose();
    } catch (e: any) {
      if (!e?.isDebouncedCancelled) {
        showToast(e?.message || 'حدث خطأ أثناء فصل الجلسات على المايكروتك', 'error');
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  const expectedDeleteConfirm = selectedNames.length === 1 ? (selectedNames[0] || 'حذف') : 'حذف';
  const isDeleteConfirmMatch = deleteConfirmText.trim().toLowerCase() === expectedDeleteConfirm.trim().toLowerCase();

  const handleConfirmDelete = async () => {
    if (!isDeleteConfirmMatch) {
      showToast(
        selectedNames.length === 1
          ? `يرجى كتابة اسم المشترك (${expectedDeleteConfirm}) بدقة لتأكيد الحذف`
          : 'يرجى كتابة كلمة "حذف" لتأكيد الحذف الجماعي',
        'error'
      );
      return;
    }
    setIsProcessing(true);
    try {
      await onExecuteBatchDelete();
      onClose();
    } catch (e: any) {
      if (!e?.isDebouncedCancelled) {
        showToast(e?.message || 'حدث خطأ أثناء حذف المشتركين من المايكروتك', 'error');
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  const handleConfirmSingleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      if (selectedIds.length > 1 && onExecuteBatchEdit) {
        // Safe selective batch update: only include fields explicitly marked for modification
        const payload: any = {};
        if (system === 'hotspot') {
          if (batchApplyProfile && editHsProfile) payload.profile = editHsProfile;
          if (batchApplyLimits) {
            payload.limitUptime = editHsLimitUptime.trim();
            payload.limitBytesTotal = editHsLimitBytesMb > 0 ? Math.round(editHsLimitBytesMb * 1024 * 1024) : 0;
          }
          if (batchApplyComment) payload.comment = editHsComment;
          if (batchApplyDisabled) payload.disabled = editHsDisabled;
        } else if (system === 'pppoe') {
          if (batchApplyService && editPppService) payload.service = editPppService;
          if (batchApplyProfile && editPppProfile) payload.profile = editPppProfile;
          if (batchApplyAddresses) {
            if (editPppLocalAddress.trim()) payload.localAddress = editPppLocalAddress.trim();
            if (editPppRemoteAddress.trim()) payload.remoteAddress = editPppRemoteAddress.trim();
          }
          if (batchApplyComment) payload.comment = editPppComment;
          if (batchApplyDisabled) payload.disabled = editPppDisabled;
        } else if (system === 'userman') {
          if (batchApplyProfile && editUmProfile) payload.profile = editUmProfile;
          if (batchApplyComment) payload.comment = editUmComment;
          if (batchApplyDisabled) payload.disabled = editUmDisabled;
        }

        if (Object.keys(payload).length === 0) {
          showToast('يرجى تحديد حقل واحد على الأقل للتعديل الجماعي', 'info');
          setIsProcessing(false);
          return;
        }

        await onExecuteBatchEdit(payload);
        onClose();
      } else {
        // Single user edit with robust fallback to selectedIds[0]
        const targetId = selectedIds[0];
        if (system === 'hotspot') {
          await onExecuteEditSingleHotspot(singleHs?.id || targetId, {
            name: editHsName.trim(),
            password: editHsPassword,
            profile: editHsProfile,
            limitUptime: editHsLimitUptime.trim(),
            limitBytesTotal: editHsLimitBytesMb > 0 ? Math.round(editHsLimitBytesMb * 1024 * 1024) : 0,
            macAddress: editHsMacAddress.trim(),
            comment: editHsComment,
            price: editHsPrice,
            disabled: editHsDisabled
          });
          onClose();
        } else if (system === 'pppoe') {
          await onExecuteEditSinglePPP(singlePpp?.id || targetId, {
            name: editPppName.trim(),
            password: editPppPassword,
            service: editPppService,
            profile: editPppProfile,
            localAddress: editPppLocalAddress.trim(),
            remoteAddress: editPppRemoteAddress.trim(),
            comment: editPppComment,
            disabled: editPppDisabled
          });
          onClose();
        } else if (system === 'userman') {
          await onExecuteEditSingleUserman(singleUm?.id || targetId, {
            name: editUmName.trim(),
            password: editUmPassword,
            customer: editUmCustomer.trim() || 'admin',
            profile: editUmProfile,
            sharedUsers: editUmSharedUsers,
            validity: editUmValidity,
            limitUptime: editUmLimitUptime.trim(),
            limitBytesTotal: editUmLimitBytesMb > 0 ? Math.round(editUmLimitBytesMb * 1024 * 1024) : 0,
            price: editUmPrice,
            comment: editUmComment,
            disabled: editUmDisabled
          });
          onClose();
        }
      }
    } catch (err: any) {
      if (!err?.isDebouncedCancelled) {
        showToast(err?.message || 'تعذر إكمال التعديل بنجاح على المايكروتك', 'error');
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-right relative max-h-[90vh] overflow-y-auto my-auto mx-auto max-w-[96vw] sm:max-w-[90vw] md:max-w-xl">
        {/* Processing Safety Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-50 rounded-3xl flex flex-col items-center justify-center p-6 text-center space-y-3 animate-in fade-in duration-150">
            <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
            <h4 className="text-sm font-bold text-white">جاري معالجة المشتركين المحددين بأمان...</h4>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              يقوم نظام ZCtrl بتنفيذ الإجراء دفعة واحدة لحماية معالج الراوتر ومنع تجميد أو انهيار الواجهة.
            </p>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {modalType === 'add' && <UserPlus className="w-5 h-5 text-emerald-400" />}
              {modalType === 'edit' && <Edit2 className="w-5 h-5" />}
              {modalType === 'change_profile' && <Layers className="w-5 h-5" />}
              {modalType === 'renew' && <RefreshCw className="w-5 h-5 text-emerald-400" />}
              {modalType === 'toggle_status' && <Power className="w-5 h-5 text-amber-400" />}
              {modalType === 'disconnect' && <Zap className="w-5 h-5 text-rose-400" />}
              {modalType === 'print_export' && <Printer className="w-5 h-5 text-purple-400" />}
              {modalType === 'delete' && <Trash2 className="w-5 h-5 text-rose-400" />}
            </div>
            <div>
              <h3 className="font-black text-base text-white">
                {modalType === 'add' && `إضافة مشترك جديد (${system === 'hotspot' ? 'هوتسبوت' : system === 'pppoe' ? 'PPPoE' : 'يوزر مانجر'})`}
                {modalType === 'edit' && (selectedIds.length === 1 ? 'تعديل بيانات المشترك' : 'تعديل المشتركين المحددين')}
                {modalType === 'change_profile' && 'تغيير البروفايل وباقة السرعة'}
                {modalType === 'renew' && 'تجديد الاشتراك وتصفير العداد'}
                {modalType === 'toggle_status' && 'تعليق أو تفعيل الحسابات'}
                {modalType === 'disconnect' && 'فصل وطرد الجلسات النشطة'}
                {modalType === 'print_export' && 'طباعة وتصدير الكروت المحددة'}
                {modalType === 'delete' && 'تأكيد الحذف النهائي للمشتركين'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {modalType === 'add' ? 'إدخال بيانت الاشتراك وإضافته مباشرة لسيرفر المايكروتك' : `تنفيذ الإجراء على ${selectedIds.length} مشترك`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Users Chips/Preview (Only for batch / edit actions) */}
        {modalType !== 'add' && (
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
            <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>المشتركون المشمولون بهذا الإجراء ({selectedNames.length}):</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {selectedNames.slice(0, 15).map((name, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-800 text-slate-200 border border-slate-700"
                >
                  {name}
                </span>
              ))}
              {selectedNames.length > 15 && (
                <span className="px-2 py-1 rounded-lg text-xs font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                  +{selectedNames.length - 15} آخرين
                </span>
              )}
            </div>
          </div>
        )}

        {/* BODY 0: ADD NEW SUBSCRIBER MODAL */}
        {modalType === 'add' && (
          <form onSubmit={handleConfirmAddSubscriber} className="space-y-3">
            {system === 'hotspot' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">اسم المستخدم / كود الهوتسبوت *</label>
                    <input
                      type="text"
                      required
                      value={addName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAddName(val);
                        if (addSameUserPass) setAddPassword(val);
                      }}
                      placeholder="أدخل اسم المشترك"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-300">كلمة السر</label>
                      {addSameUserPass && (
                        <span className="text-[10px] text-emerald-400 font-bold">مطابقة لاسم المشترك</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={addSameUserPass ? addName : addPassword}
                      disabled={addSameUserPass}
                      onChange={(e) => setAddPassword(e.target.value)}
                      placeholder="كلمة السر (مطابقة للاسم)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                    <span className="text-slate-300 font-bold flex items-center gap-1.5">
                      <span>🔑</span>
                      <span>مطابقة كلمة المرور مع اسم المشترك (اسم المستخدم = كلمة المرور):</span>
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addSameUserPass}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAddSameUserPass(checked);
                          if (checked) setAddPassword(addName);
                        }}
                        className="rounded text-emerald-600 bg-slate-950 border-slate-700 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-bold text-emerald-400">تفعيل</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">البروفايل (الباقة)</label>
                    <select
                      value={addProfile}
                      onChange={(e) => {
                        const profName = e.target.value;
                        setAddProfile(profName);
                        const found = hotspotProfiles.find((p) => p.name === profName);
                        if (found && (found as any).price !== undefined) {
                          setAddPrice(Number((found as any).price) || 0);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {hotspotProfiles.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name} {p.rateLimit ? `(${p.rateLimit})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">السعر (ر.س)</label>
                    <input
                      type="number"
                      min={0}
                      value={addPrice}
                      onChange={(e) => setAddPrice(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">تحديد الوقت (Limit Uptime)</label>
                    <input
                      type="text"
                      value={addLimitUptime}
                      onChange={(e) => setAddLimitUptime(e.target.value)}
                      placeholder="01:00:00 (اختياري)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">حجم البيانات (MB)</label>
                    <input
                      type="number"
                      min={0}
                      value={addLimitBytesMb}
                      onChange={(e) => setAddLimitBytesMb(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="0 لا يوجد حد"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">تثبيت الماك أدرس (MAC)</label>
                  <input
                    type="text"
                    value={addMacAddress}
                    onChange={(e) => setAddMacAddress(e.target.value)}
                    placeholder="00:11:22:33:44:55"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات</label>
                  <input
                    type="text"
                    value={addComment}
                    onChange={(e) => setAddComment(e.target.value)}
                    placeholder="ملاحظات توضيحية للمشترك"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </>
            )}

            {system === 'pppoe' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">اسم مشترك PPPoE *</label>
                    <input
                      type="text"
                      required
                      value={addName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAddName(val);
                        if (addSameUserPass) setAddPassword(val);
                      }}
                      placeholder="اسم المستخدم"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-300">كلمة السر *</label>
                      {addSameUserPass && (
                        <span className="text-[10px] text-emerald-400 font-bold">مطابقة للاسم</span>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={addSameUserPass ? addName : addPassword}
                      disabled={addSameUserPass}
                      onChange={(e) => setAddPassword(e.target.value)}
                      placeholder="كلمة المرور"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                    <span className="text-slate-300 font-bold flex items-center gap-1.5">
                      <span>🔑</span>
                      <span>مطابقة كلمة المرور مع اسم المشترك (اسم المستخدم = كلمة المرور):</span>
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addSameUserPass}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAddSameUserPass(checked);
                          if (checked) setAddPassword(addName);
                        }}
                        className="rounded text-emerald-600 bg-slate-950 border-slate-700 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-bold text-emerald-400">تفعيل</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">البروفايل</label>
                    <select
                      value={addProfile}
                      onChange={(e) => setAddProfile(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {pppProfiles.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">الخدمة</label>
                    <select
                      value={addService}
                      onChange={(e) => setAddService(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="pppoe">pppoe</option>
                      <option value="any">any</option>
                      <option value="pptp">pptp</option>
                      <option value="l2tp">l2tp</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">IP المحلي (Local IP)</label>
                    <input
                      type="text"
                      value={addLocalAddress}
                      onChange={(e) => setAddLocalAddress(e.target.value)}
                      placeholder="192.168.10.1 (اختياري)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">IP البعيد (Remote IP)</label>
                    <input
                      type="text"
                      value={addRemoteAddress}
                      onChange={(e) => setAddRemoteAddress(e.target.value)}
                      placeholder="192.168.10.100 (اختياري)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات</label>
                  <input
                    type="text"
                    value={addComment}
                    onChange={(e) => setAddComment(e.target.value)}
                    placeholder="ملاحظات الحساب"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </>
            )}

            {system === 'userman' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">اسم المشترك *</label>
                    <input
                      type="text"
                      required
                      value={addName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAddName(val);
                        if (addSameUserPass) setAddPassword(val);
                      }}
                      placeholder="اسم المشترك"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-300">كلمة السر</label>
                      {addSameUserPass && (
                        <span className="text-[10px] text-emerald-400 font-bold">مطابقة للاسم</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={addSameUserPass ? addName : addPassword}
                      disabled={addSameUserPass}
                      onChange={(e) => setAddPassword(e.target.value)}
                      placeholder="كلمة المرور"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                    <span className="text-slate-300 font-bold flex items-center gap-1.5">
                      <span>🔑</span>
                      <span>مطابقة كلمة المرور مع اسم المشترك (اسم المستخدم = كلمة المرور):</span>
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addSameUserPass}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAddSameUserPass(checked);
                          if (checked) setAddPassword(addName);
                        }}
                        className="rounded text-emerald-600 bg-slate-950 border-slate-700 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-bold text-emerald-400">تفعيل</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">البروفايل</label>
                    <select
                      value={addProfile}
                      onChange={(e) => setAddProfile(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {usermanProfiles.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">المالك / Customer</label>
                    <input
                      type="text"
                      value={addCustomer}
                      onChange={(e) => setAddCustomer(e.target.value)}
                      placeholder="admin"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات</label>
                  <input
                    type="text"
                    value={addComment}
                    onChange={(e) => setAddComment(e.target.value)}
                    placeholder="ملاحظات الحساب"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                <span>إضافة المشترك بالسيرفر</span>
              </button>
            </div>
          </form>
        )}

        {/* BODY 1: CHANGE PROFILE MODAL */}
        {modalType === 'change_profile' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">اختر البروفايل الجديد المستهدف:</label>
              <select
                value={targetProfile}
                onChange={(e) => setTargetProfile(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                {currentProfiles.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name} {p.rateLimit ? `(${p.rateLimit})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={resetLimitsOnProfileChange}
                onChange={(e) => setResetLimitsOnProfileChange(e.target.checked)}
                className="rounded text-blue-500 bg-slate-900 border-slate-700"
              />
              <span>تصفير العدادات والوقت عند تغيير البروفايل تلقائياً</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmChangeProfile}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-1.5"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>إتمام نقل البروفايل</span>
              </button>
            </div>
          </div>
        )}

        {/* BODY 2: RENEW MODAL */}
        {modalType === 'renew' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              سيتم تجديد اشتراك المشتركين المحددين وإعادة تنشيط حساباتهم على سيرفر ZCtrl:
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={renewResetUptime}
                  onChange={(e) => setRenewResetUptime(e.target.checked)}
                  className="rounded text-emerald-500 bg-slate-900 border-slate-700"
                />
                <span>تصفير مدة الاتصال المستهلكة (Uptime = 0s)</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={renewResetBytes}
                  onChange={(e) => setRenewResetBytes(e.target.checked)}
                  className="rounded text-emerald-500 bg-slate-900 border-slate-700"
                />
                <span>تصفير حجم استهلاك البيانات (Bytes In/Out = 0)</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={renewEnableAccount}
                  onChange={(e) => setRenewEnableAccount(e.target.checked)}
                  className="rounded text-emerald-500 bg-slate-900 border-slate-700"
                />
                <span>تفعيل الحساب وإزالة حالة التعليق (Enable Account)</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmRenew}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>إتمام تجديد الاشتراك</span>
              </button>
            </div>
          </div>
        )}

        {/* BODY 3: TOGGLE STATUS (SUSPEND / ACTIVATE) */}
        {modalType === 'toggle_status' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">اختر الإجراء المطلوب:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTargetStatusAction('enable')}
                  className={`p-3.5 rounded-xl border text-center font-bold text-xs flex flex-col items-center gap-2 transition-all ${
                    targetStatusAction === 'enable'
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Power className="w-5 h-5 text-emerald-400" />
                  <span>تفعيل وتشغيل الحسابات</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetStatusAction('disable')}
                  className={`p-3.5 rounded-xl border text-center font-bold text-xs flex flex-col items-center gap-2 transition-all ${
                    targetStatusAction === 'disable'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300 ring-2 ring-amber-500/30'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Power className="w-5 h-5 text-amber-400" />
                  <span>تعليق وتعطيل الحسابات</span>
                </button>
              </div>
            </div>

            {targetStatusAction === 'disable' && (
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={kickActiveOnDisable}
                  onChange={(e) => setKickActiveOnDisable(e.target.checked)}
                  className="rounded text-amber-500 bg-slate-900 border-slate-700"
                />
                <span>طرد وفصل الجلسة الحية فوراً في حال كان المشترك متصلاً الآن</span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmToggleStatus}
                className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg transition-all flex items-center gap-1.5 ${
                  targetStatusAction === 'enable'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                    : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                }`}
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>إتمام تطبيق الحالة</span>
              </button>
            </div>
          </div>
        )}

        {/* BODY 4: DISCONNECT ACTIVE SESSIONS MODAL */}
        {modalType === 'disconnect' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3">
              <Zap className="w-5 h-5 text-rose-400 shrink-0" />
              <p className="text-xs text-rose-200">
                سيتم إرسال أمر فصل وطرد فوري لجميع الجلسات الحية النشطة للمشتركين المحددين من سيرفر ZCtrl.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmDisconnect}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center gap-1.5"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                <span>إتمام فصل الجلسات</span>
              </button>
            </div>
          </div>
        )}

        {/* BODY 5: PRINT & EXPORT MODAL */}
        {modalType === 'print_export' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              اختر صيغة وتنسيق التصدير أو الطباعة للكروت والمشتركين المحددين ({selectedNames.length} كرت):
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  const targetList =
                    system === 'hotspot' ? selectedHotspot : system === 'pppoe' ? selectedPPP : selectedUserman;
                  if (onNavigateToPrint) {
                    onNavigateToPrint(targetList);
                    onClose();
                  } else {
                    showToast('تم إرسال المشتركين إلى استوديو الطباعة', 'success');
                    onClose();
                  }
                }}
                className="p-4 rounded-2xl bg-purple-950/60 border border-purple-500/40 hover:border-purple-400 text-right space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <Printer className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">
                    قوالب احترافية
                  </span>
                </div>
                <h4 className="font-bold text-sm text-white">استوديو طباعة الكروت</h4>
                <p className="text-[11px] text-slate-400">
                  فتح استوديو الكروت مع كود QR، باركود، وتنسيق ورق A4 / حراري
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetList =
                    system === 'hotspot' ? selectedHotspot : system === 'pppoe' ? selectedPPP : selectedUserman;
                  if (onExportCsv) {
                    onExportCsv(targetList);
                  }
                  onClose();
                }}
                className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-blue-500/50 text-right space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <Download className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">
                    CSV / Excel
                  </span>
                </div>
                <h4 className="font-bold text-sm text-white">تصدير لملف إكسل CSV</h4>
                <p className="text-[11px] text-slate-400">تنزيل جدول بيانات المشتركين كاملاً بملف منظم</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetList =
                    system === 'hotspot' ? selectedHotspot : system === 'pppoe' ? selectedPPP : selectedUserman;
                  if (onExportPdf) {
                    onExportPdf(targetList);
                  }
                  onClose();
                }}
                className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 hover:border-rose-400 text-right space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <FileDown className="w-5 h-5 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold">
                    مستند رسمي PDF
                  </span>
                </div>
                <h4 className="font-bold text-sm text-white">تصدير تقرير PDF منسق</h4>
                <p className="text-[11px] text-slate-400">إنشاء وثيقة PDF معتمدة مع الجداول والمؤشرات والإحصائيات</p>
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}

        {/* BODY 6: DELETE CONFIRMATION MODAL */}
        {modalType === 'delete' && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-rose-300">تحذير الحذف النهائي الصارم (SAFE-08)!</h4>
                <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
                  أنت على وشك حذف <span className="font-bold font-mono">{selectedIds.length}</span> مشترك نهائياً من راوتر ZCtrl. هذا الإجراء لا يمكن التراجع عنه ويتم تسجيله في سجل التدقيق المشفر.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                {selectedNames.length === 1 ? (
                  <>
                    لتأكيد الحذف وفق قاعدة الأمان الحاكمة، اكتب اسم المشترك صراحة:{' '}
                    <span className="font-mono text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/30 text-xs">
                      {expectedDeleteConfirm}
                    </span>
                  </>
                ) : (
                  <>
                    لتأكيد الحذف الجماعي، اكتب كلمة:{' '}
                    <span className="font-mono text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/30 text-xs">
                      حذف
                    </span>
                  </>
                )}
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={expectedDeleteConfirm}
                className="w-full bg-slate-900 border border-slate-700 focus:border-rose-500 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-600 outline-none"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                disabled={isProcessing || !isDeleteConfirmMatch}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>نعم، إتمام الحذف النهائي</span>
              </button>
            </div>
          </div>
        )}

        {/* BODY 7: EDIT SINGLE USER MODAL */}
        {modalType === 'edit' && (
          <form onSubmit={handleConfirmSingleEdit} className="space-y-3">
            {system === 'hotspot' && (
              <>
                {selectedIds.length === 1 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">اسم المستخدم</label>
                      <input
                        type="text"
                        required
                        value={editHsName}
                        onChange={(e) => setEditHsName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">كلمة السر</label>
                      <input
                        type="text"
                        value={editHsPassword}
                        onChange={(e) => setEditHsPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-200 space-y-1">
                    <div>
                      تعديل جماعي لـ <strong>{selectedIds.length}</strong> مشترك: سيتم تعديل الحقول المحددة علامتها (✓) فقط مع الحفاظ على باقي بيانات كل مشترك دون مسحها.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>البروفايل</span>
                      {selectedIds.length > 1 && (
                        <input
                          type="checkbox"
                          checked={batchApplyProfile}
                          onChange={(e) => setBatchApplyProfile(e.target.checked)}
                          title="تطبيق تغيير البروفايل على جميع المحددين"
                          className="rounded text-blue-500"
                        />
                      )}
                    </label>
                    <select
                      value={editHsProfile}
                      onChange={(e) => {
                        setEditHsProfile(e.target.value);
                        if (selectedIds.length > 1) setBatchApplyProfile(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {hotspotProfiles.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedIds.length === 1 && (
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">السعر (ر.س)</label>
                      <input
                        type="number"
                        min={0}
                        value={editHsPrice}
                        onChange={(e) => setEditHsPrice(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>تحديد الوقت (Limit Uptime)</span>
                      {selectedIds.length > 1 && (
                        <input
                          type="checkbox"
                          checked={batchApplyLimits}
                          onChange={(e) => setBatchApplyLimits(e.target.checked)}
                          title="تطبيق تغيير الحصص على جميع المحددين"
                          className="rounded text-blue-500"
                        />
                      )}
                    </label>
                    <input
                      type="text"
                      value={editHsLimitUptime}
                      onChange={(e) => {
                        setEditHsLimitUptime(e.target.value);
                        if (selectedIds.length > 1) setBatchApplyLimits(true);
                      }}
                      placeholder="01:00:00 (اتركه فارغاً لإزالة الحد)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">حجم البيانات (MB)</label>
                    <input
                      type="number"
                      min={0}
                      value={editHsLimitBytesMb}
                      onChange={(e) => {
                        setEditHsLimitBytesMb(Math.max(0, Number(e.target.value) || 0));
                        if (selectedIds.length > 1) setBatchApplyLimits(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                {selectedIds.length === 1 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">عنوان الماك MAC</label>
                    <input
                      type="text"
                      value={editHsMacAddress}
                      onChange={(e) => setEditHsMacAddress(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                    <span>ملاحظات</span>
                    {selectedIds.length > 1 && (
                      <input
                        type="checkbox"
                        checked={batchApplyComment}
                        onChange={(e) => setBatchApplyComment(e.target.checked)}
                        title="تطبيق الملاحظة على جميع المحددين"
                        className="rounded text-blue-500"
                      />
                    )}
                  </label>
                  <input
                    type="text"
                    value={editHsComment}
                    onChange={(e) => {
                      setEditHsComment(e.target.value);
                      if (selectedIds.length > 1) setBatchApplyComment(true);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={editHsDisabled}
                      onChange={(e) => {
                        setEditHsDisabled(e.target.checked);
                        if (selectedIds.length > 1) setBatchApplyDisabled(true);
                      }}
                      className="rounded text-amber-500"
                    />
                    <span>تعليق / تعطيل الحساب</span>
                  </label>
                  {selectedIds.length > 1 && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        checked={batchApplyDisabled}
                        onChange={(e) => setBatchApplyDisabled(e.target.checked)}
                        className="rounded text-blue-500"
                      />
                      <span>تطبيق الحالة</span>
                    </label>
                  )}
                </div>
              </>
            )}

            {system === 'pppoe' && (
              <>
                {selectedIds.length === 1 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">اسم المشترك</label>
                      <input
                        type="text"
                        required
                        value={editPppName}
                        onChange={(e) => setEditPppName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">كلمة السر</label>
                      <input
                        type="text"
                        required
                        value={editPppPassword}
                        onChange={(e) => setEditPppPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-200">
                    تعديل جماعي لـ <strong>{selectedIds.length}</strong> مشترك PPPoE: سيتم تطبيق الحقول المحددة علامتها (✓) فقط مع الحفاظ على باقي بيانات كل مشترك.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>الخدمة</span>
                      {selectedIds.length > 1 && (
                        <input
                          type="checkbox"
                          checked={batchApplyService}
                          onChange={(e) => setBatchApplyService(e.target.checked)}
                          className="rounded text-emerald-500"
                        />
                      )}
                    </label>
                    <select
                      value={editPppService}
                      onChange={(e) => {
                        setEditPppService(e.target.value);
                        if (selectedIds.length > 1) setBatchApplyService(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="pppoe">pppoe</option>
                      <option value="any">any</option>
                      <option value="pptp">pptp</option>
                      <option value="l2tp">l2tp</option>
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>البروفايل</span>
                      {selectedIds.length > 1 && (
                        <input
                          type="checkbox"
                          checked={batchApplyProfile}
                          onChange={(e) => setBatchApplyProfile(e.target.checked)}
                          className="rounded text-emerald-500"
                        />
                      )}
                    </label>
                    <select
                      value={editPppProfile}
                      onChange={(e) => {
                        setEditPppProfile(e.target.value);
                        if (selectedIds.length > 1) setBatchApplyProfile(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {pppProfiles.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>IP المحلي</span>
                      {selectedIds.length > 1 && (
                        <input
                          type="checkbox"
                          checked={batchApplyAddresses}
                          onChange={(e) => setBatchApplyAddresses(e.target.checked)}
                          className="rounded text-emerald-500"
                        />
                      )}
                    </label>
                    <input
                      type="text"
                      value={editPppLocalAddress}
                      onChange={(e) => {
                        setEditPppLocalAddress(e.target.value);
                        if (selectedIds.length > 1) setBatchApplyAddresses(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">IP البعيد</label>
                    <input
                      type="text"
                      value={editPppRemoteAddress}
                      onChange={(e) => {
                        setEditPppRemoteAddress(e.target.value);
                        if (selectedIds.length > 1) setBatchApplyAddresses(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                    <span>ملاحظات</span>
                    {selectedIds.length > 1 && (
                      <input
                        type="checkbox"
                        checked={batchApplyComment}
                        onChange={(e) => setBatchApplyComment(e.target.checked)}
                        className="rounded text-emerald-500"
                      />
                    )}
                  </label>
                  <input
                    type="text"
                    value={editPppComment}
                    onChange={(e) => {
                      setEditPppComment(e.target.value);
                      if (selectedIds.length > 1) setBatchApplyComment(true);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={editPppDisabled}
                      onChange={(e) => {
                        setEditPppDisabled(e.target.checked);
                        if (selectedIds.length > 1) setBatchApplyDisabled(true);
                      }}
                      className="rounded text-amber-500"
                    />
                    <span>تعليق / تعطيل الحساب</span>
                  </label>
                  {selectedIds.length > 1 && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        checked={batchApplyDisabled}
                        onChange={(e) => setBatchApplyDisabled(e.target.checked)}
                        className="rounded text-emerald-500"
                      />
                      <span>تطبيق الحالة</span>
                    </label>
                  )}
                </div>
              </>
            )}

            {system === 'userman' && (
              <>
                {selectedIds.length === 1 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">اسم المشترك</label>
                      <input
                        type="text"
                        required
                        value={editUmName}
                        onChange={(e) => setEditUmName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">كلمة السر</label>
                      <input
                        type="text"
                        value={editUmPassword}
                        onChange={(e) => setEditUmPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-200">
                    تعديل جماعي لـ <strong>{selectedIds.length}</strong> مشترك يوزر مانجر: سيتم تطبيق الحقول المحددة علامتها (✓) فقط مع الحفاظ على باقي بيانات كل مشترك.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>البروفايل</span>
                      {selectedIds.length > 1 && (
                        <input
                          type="checkbox"
                          checked={batchApplyProfile}
                          onChange={(e) => setBatchApplyProfile(e.target.checked)}
                          className="rounded text-purple-500"
                        />
                      )}
                    </label>
                    <select
                      value={editUmProfile}
                      onChange={(e) => {
                        setEditUmProfile(e.target.value);
                        if (selectedIds.length > 1) setBatchApplyProfile(true);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {usermanProfiles.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">المالك / Customer</label>
                    <input
                      type="text"
                      value={editUmCustomer}
                      onChange={(e) => setEditUmCustomer(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                    <span>ملاحظات</span>
                    {selectedIds.length > 1 && (
                      <input
                        type="checkbox"
                        checked={batchApplyComment}
                        onChange={(e) => setBatchApplyComment(e.target.checked)}
                        className="rounded text-purple-500"
                      />
                    )}
                  </label>
                  <input
                    type="text"
                    value={editUmComment}
                    onChange={(e) => {
                      setEditUmComment(e.target.value);
                      if (selectedIds.length > 1) setBatchApplyComment(true);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={editUmDisabled}
                      onChange={(e) => {
                        setEditUmDisabled(e.target.checked);
                        if (selectedIds.length > 1) setBatchApplyDisabled(true);
                      }}
                      className="rounded text-amber-500"
                    />
                    <span>تعليق / تعطيل الحساب</span>
                  </label>
                  {selectedIds.length > 1 && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        checked={batchApplyDisabled}
                        onChange={(e) => setBatchApplyDisabled(e.target.checked)}
                        className="rounded text-purple-500"
                      />
                      <span>تطبيق الحالة</span>
                    </label>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-1.5"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>إتمام وحفظ التعديلات</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
