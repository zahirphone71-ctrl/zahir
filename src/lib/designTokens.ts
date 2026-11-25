export * from '../designTokens';

export const SERVICE_COLORS = Object.freeze({
  hotspot: Object.freeze({
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    icon: 'Wifi',
    label: 'هوتسبوت'
  }),
  pppoe: Object.freeze({
    bg: 'bg-violet-500/15',
    text: 'text-violet-300',
    border: 'border-violet-500/30',
    icon: 'Radio',
    label: 'PPPoE'
  }),
  userman: Object.freeze({
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    icon: 'Server',
    label: 'يوزر مانجر'
  })
});

export const STATUS_COLORS = Object.freeze({
  online: Object.freeze({
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400'
  }),
  idle: Object.freeze({
    bg: 'bg-sky-500/15',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    dot: 'bg-sky-400'
  }),
  suspended: Object.freeze({
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400'
  }),
  expired: Object.freeze({
    bg: 'bg-rose-500/15',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    dot: 'bg-rose-400'
  }),
  new: Object.freeze({
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    dot: 'bg-indigo-400'
  })
});
