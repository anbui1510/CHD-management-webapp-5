import React, { useState, useEffect } from 'react';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string; // ISO format: yyyy-mm-dd
  onChange: (value: string) => void;
}

export function VNDateInput({ value, onChange, className, ...props }: Props) {
  const [displayValue, setDisplayValue] = useState('');

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

  return (
    <input 
      type="text" 
      placeholder="dd/mm/yyyy"
      value={displayValue}
      onChange={handleChange}
      className={className}
      {...props}
    />
  );
}
