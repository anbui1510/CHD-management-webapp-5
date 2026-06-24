import React, { useState, useEffect, useRef } from 'react';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string; // ISO format: yyyy-mm-dd
  onChange: (value: string) => void;
}

export function VNDateInput({ value, onChange, className, ...props }: Props) {
  const [displayValue, setDisplayValue] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Sync internal display state with incoming value (yyyy-mm-dd)
  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        setDisplayValue(`${parts[2]}/${parts[1]}/${parts[0]}`);
      } else {
         setDisplayValue('');
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d]/g, '');
    if (raw.length > 8) raw = raw.slice(0, 8);
    
    let formatted = raw;
    if (raw.length > 4) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
    } else if (raw.length > 2) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    }
    
    setDisplayValue(formatted);
    
    if (raw.length === 8) {
      const day = raw.slice(0, 2);
      const month = raw.slice(2, 4);
      const year = raw.slice(4);
      onChange(`${year}-${month}-${day}`);
    } else {
      onChange(''); // Not full yet
    }
  };

  const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = e.target.value; // yyyy-mm-dd
    onChange(selectedDate);
  };

  const triggerPicker = () => {
    if (dateInputRef.current) {
      try {
        if (typeof dateInputRef.current.showPicker === 'function') {
          dateInputRef.current.showPicker();
        } else {
          dateInputRef.current.focus();
        }
      } catch (err) {
        console.warn('showPicker not supported:', err);
        dateInputRef.current.focus();
      }
    }
  };

  return (
    <div className="relative flex items-center w-full">
      <input 
        type="text" 
        placeholder="dd/mm/yyyy"
        value={displayValue}
        onChange={handleChange}
        className={`${className || ''} pr-10`} // Padding right to make room for the calendar icon
        {...props}
      />
      {/* Hidden native date input */}
      <input
        type="date"
        ref={dateInputRef}
        value={value || ''}
        onChange={handleDatePickerChange}
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
        style={{ right: '10px' }}
      />
      {/* Calendar icon button */}
      <button
        type="button"
        onClick={triggerPicker}
        className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition flex items-center justify-center"
        title="Chọn từ lịch"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
        </svg>
      </button>
    </div>
  );
}
