import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Calculator, 
  FileText, 
  Building2, 
  Calendar, 
  Hash, 
  Plus, 
  Info,
  Printer,
  Upload,
  FileSearch,
  AlertCircle,
  Database,
  Trash2,
  CheckCircle2,
  XCircle,
  Save,
  GitCompare,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Constants ---
const VAT_RATE = 0.15;
const STORAGE_KEY = 'auditflow_vat_data';
const DRAFTS_KEY = 'auditflow_vat_drafts';

// --- Types ---
interface Draft extends TaxData {
  id: string;
  name: string;
  timestamp: string;
}

interface TaxData {
  companyName: string;
  taxNumber: string;
  quarter: string;
  fromDate: string;
  toDate: string;
  
  // Sales
  salesVatAmount: number;
  salesVatAdjustment: number;
  salesZeroAmount: number;
  salesZeroAdjustment: number;
  salesExemptAmount: number;
  salesExemptAdjustment: number;
  
  // Purchases
  purchaseVatAmount: number;
  purchaseVatAdjustment: number;
  purchaseZeroAmount: number;
  purchaseZeroAdjustment: number;
  purchaseExemptAmount: number;
  purchaseExemptAdjustment: number;
  
  // Journal/Adjustments
  journalVatAmount: number; // User inputs the VAT amount
  vatCreditCarried: number;
  corrections: number;
}

const initialData: TaxData = {
  companyName: '',
  taxNumber: '',
  quarter: '',
  fromDate: '',
  toDate: '',
  salesVatAmount: 0,
  salesVatAdjustment: 0,
  salesZeroAmount: 0,
  salesZeroAdjustment: 0,
  salesExemptAmount: 0,
  salesExemptAdjustment: 0,
  purchaseVatAmount: 0,
  purchaseVatAdjustment: 0,
  purchaseZeroAmount: 0,
  purchaseZeroAdjustment: 0,
  purchaseExemptAmount: 0,
  purchaseExemptAdjustment: 0,
  journalVatAmount: 0,
  vatCreditCarried: 0,
  corrections: 0,
};

// --- Utils ---
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const round = (num: number) => Math.round(num * 100) / 100;

const calculateTotals = (data: TaxData) => {
  // Ensure all adjustments are treated as deductions (always negative in calculation)
  const sVatAdj = -Math.abs(data.salesVatAdjustment);
  const sZeroAdj = -Math.abs(data.salesZeroAdjustment);
  const sExemptAdj = -Math.abs(data.salesExemptAdjustment);

  const pVatAdj = -Math.abs(data.purchaseVatAdjustment);
  const pZeroAdj = -Math.abs(data.purchaseZeroAdjustment);
  const pExemptAdj = -Math.abs(data.purchaseExemptAdjustment);

  // Sales Totals
  const salesTotalAmount = round(data.salesVatAmount + data.salesZeroAmount + data.salesExemptAmount);
  const salesTotalAdjustment = round(sVatAdj + sZeroAdj + sExemptAdj);
  const salesVatDue = round((data.salesVatAmount + sVatAdj) * VAT_RATE);
  
  // Purchase Totals
  const purchaseTotalAmount = round(data.purchaseVatAmount + data.purchaseZeroAmount + data.purchaseExemptAmount);
  const purchaseTotalAdjustment = round(pVatAdj + pZeroAdj + pExemptAdj);
  const purchaseVatPaid = round(round((data.purchaseVatAmount + pVatAdj) * VAT_RATE) + data.journalVatAmount);

  // Journal Logic
  const journalPrincipal = round(data.journalVatAmount / VAT_RATE);

  const currentVatDue = round(salesVatDue - purchaseVatPaid);
  const netVatDue = round(currentVatDue - data.vatCreditCarried + data.corrections);

  return {
    salesTotalAmount,
    salesTotalAdjustment,
    salesVatDue,
    purchaseTotalAmount,
    purchaseTotalAdjustment,
    purchaseVatPaid,
    journalPrincipal,
    currentVatDue,
    netVatDue
  };
};

// --- Components ---
const SectionHeader = ({ title, icon: Icon, colorClass }: { title: string, icon: any, colorClass: string }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className={`p-2 rounded-lg ${colorClass}`}>
      <Icon size={18} className="text-white" />
    </div>
    <h2 className="text-lg font-bold text-slate-800 tracking-tight">{title}</h2>
  </div>
);

const HeaderField = ({ label, icon: Icon, value, onChange, placeholder, type = "text" }: any) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-2 ml-1">
      <Icon size={14} className="text-slate-400" />
      {label}
    </label>
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
    />
  </div>
);

const TableRow = ({ 
  label, 
  amount, 
  adjustment, 
  taxAmount, 
  onAmountChange, 
  onAdjustmentChange,
  isTotal = false,
  readOnlyTax = false
}: { 
  label: string; 
  amount: number; 
  adjustment?: number; 
  taxAmount: number;
  onAmountChange?: (v: number) => void;
  onAdjustmentChange?: (v: number) => void;
  isTotal?: boolean;
  readOnlyTax?: boolean;
}) => (
  <tr className={`${isTotal ? 'bg-slate-50 font-bold border-t-2 border-slate-200' : 'hover:bg-slate-50/50'} border-b border-slate-100 transition-colors`}>
    <td className={`py-4 px-4 text-sm ${isTotal ? 'text-slate-900' : 'text-slate-600'} font-medium`}>{label}</td>
    <td className="py-4 px-4">
      {onAmountChange ? (
        <input 
          type="number"
          value={amount === 0 ? '' : amount}
          onChange={(e) => onAmountChange(parseFloat(e.target.value) || 0)}
          className="w-full text-right bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-sm font-mono"
          placeholder="0.00"
        />
      ) : (
        <div className="text-right text-sm font-mono">{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
      )}
    </td>
    <td className="py-4 px-4">
      {onAdjustmentChange ? (
        <input 
          type="number"
          value={adjustment === 0 ? '' : adjustment}
          onChange={(e) => onAdjustmentChange(parseFloat(e.target.value) || 0)}
          className="w-full text-right bg-transparent focus:bg-white focus:ring-1 focus:ring-red-500 rounded px-2 py-1 text-sm font-mono text-red-600"
          placeholder="0.00"
        />
      ) : adjustment !== undefined ? (
        <div className="text-right text-sm font-mono text-red-600">
          {adjustment !== 0 ? "-" + Math.abs(adjustment).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-0.00"}
        </div>
      ) : null}
    </td>
    <td className={`py-4 px-4 text-right text-sm font-mono font-bold ${isTotal ? 'text-slate-900' : 'text-blue-600'}`}>
      {taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </td>
  </tr>
);

type TabType = 'overview' | 'sales' | 'purchases' | 'result' | 'compare';

export default function App() {
  const [data, setData] = useState<TaxData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...initialData, ...parsed };
      } catch (e) {
        console.error("Failed to load cache:", e);
      }
    }
    return initialData;
  });
  const [isParsing, setIsParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const savedDrafts = localStorage.getItem(DRAFTS_KEY);
    if (savedDrafts) {
      try {
        return JSON.parse(savedDrafts);
      } catch (e) {
        console.error("Failed to load drafts:", e);
      }
    }
    return [];
  });
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }, [drafts]);

  const clearAll = () => {
    if (window.confirm("Are you sure you want to clear all data? This cannot be undone.")) {
      setData(initialData);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handlePrint = () => {
    window.focus();
    window.print();
  };

  const saveAsDraft = () => {
    const name = window.prompt("Enter a name for this draft:", `Draft ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
    if (name) {
      const newDraft: Draft = {
        ...data,
        id: Math.random().toString(36).substring(2, 9),
        name,
        timestamp: new Date().toISOString()
      };
      setDrafts(prev => [newDraft, ...prev]);
    }
  };

  const deleteDraft = (id: string) => {
    if (window.confirm("Delete this draft?")) {
      setDrafts(prev => prev.filter(d => d.id !== id));
      if (compareIds?.includes(id)) setCompareIds(null);
    }
  };

  const loadDraft = (draft: Draft) => {
    if (window.confirm("Load this draft? Current unsaved changes might be lost if not saved as draft.")) {
      setData(draft);
      setActiveTab('overview');
    }
  };

  const totals = useMemo(() => calculateTotals(data), [data]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setErrorMsg(null);
    
    const performExtraction = async (retryCount = 0): Promise<void> => {
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64Data = await base64Promise;

        const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey || apiKey === "undefined" || apiKey === "" || apiKey === "UNDEFINED" || apiKey === "null") {
          throw new Error("API_KEY_MISSING");
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: "application/pdf"
                }
              },
              {
                text: `You are an expert KSA VAT Auditor specialized in ZATCA (GAZT) bilingual tax returns. 
                Extract the following data from the provided VAT Return PDF. 
                
                The form has two main sections:
                SECTION 1: VAT ON SALES (Items 1-6)
                SECTION 2: VAT ON PURCHASES (Items 7-12)
                
                Extract:
                - companyName: The name of the taxpayer/company (Arabic or English).
                - taxNumber: The 15-digit VAT registration number.
                - quarter: The tax period (e.g. Quarter 4, 2024).
                - fromDate: Start date of period (DD-MM-YYYY).
                - toDate: End date of period (DD-MM-YYYY).
                
                Sales Table (Table items 1-6):
                - salesVatAmount: Amount from "Standard rated sales at 15%" (item 1).
                - salesVatAdjustment: Adjustment from "Standard rated sales at 15%" (item 1).
                - salesZeroAmount: Amount from "Zero rated domestic sales" or "Exports" (items 3-4).
                - salesZeroAdjustment: Adjustment from items 3-4.
                - salesExemptAmount: Amount from "Exempt sales" (item 5).
                - salesExemptAdjustment: Adjustment from item 5.
                
                Purchases Table (Table items 7-12):
                - purchaseVatAmount: Sum of amounts from "Standard rated domestic purchases at 15%" and any Imports (items 7-9).
                - purchaseVatAdjustment: Sum of adjustments from items 7-9.
                - purchaseZeroAmount: Amount from "Zero rated purchases" (item 10).
                - purchaseZeroAdjustment: Adjustment from item 10.
                - purchaseExemptAmount: Amount from "Exempt purchases" (item 11).
                - purchaseExemptAdjustment: Adjustment from item 11.
                
                Others:
                - journalVat: Any "VAT Paid" or manual journal adjustments.
                - vatCreditCarried: "VAT Credit carried forward from previous period".
                - corrections: Total of "Corrections from previous period".
                
                Return exactly this JSON structure. Convert all SAR values to numbers. If a value is missing or 0.00, return 0.`
              }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                companyName: { type: Type.STRING },
                taxNumber: { type: Type.STRING },
                quarter: { type: Type.STRING },
                fromDate: { type: Type.STRING },
                toDate: { type: Type.STRING },
                salesVatAmount: { type: Type.NUMBER },
                salesVatAdjustment: { type: Type.NUMBER },
                salesZeroAmount: { type: Type.NUMBER },
                salesZeroAdjustment: { type: Type.NUMBER },
                salesExemptAmount: { type: Type.NUMBER },
                salesExemptAdjustment: { type: Type.NUMBER },
                purchaseVatAmount: { type: Type.NUMBER },
                purchaseVatAdjustment: { type: Type.NUMBER },
                purchaseZeroAmount: { type: Type.NUMBER },
                purchaseZeroAdjustment: { type: Type.NUMBER },
                purchaseExemptAmount: { type: Type.NUMBER },
                purchaseExemptAdjustment: { type: Type.NUMBER },
                journalVat: { type: Type.NUMBER },
                vatCreditCarried: { type: Type.NUMBER },
                corrections: { type: Type.NUMBER },
              },
              required: ["companyName", "taxNumber"]
            }
          }
        });

        let responseText = response.text || "{}";
        // Clean up markdown if present
        responseText = responseText.replace(/```json\n?|```/g, "").trim();
        
        const parsed = JSON.parse(responseText);

        const getNum = (val: any) => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const n = parseFloat(val.replace(/,/g, ''));
            return isNaN(n) ? 0 : n;
          }
          return 0;
        };

        setData(prev => ({
          ...prev,
          companyName: parsed.companyName || prev.companyName,
          taxNumber: parsed.taxNumber || prev.taxNumber,
          quarter: parsed.quarter || prev.quarter,
          fromDate: parsed.fromDate || prev.fromDate,
          toDate: parsed.toDate || prev.toDate,
          
          salesVatAmount: getNum(parsed.salesVatAmount),
          salesVatAdjustment: getNum(parsed.salesVatAdjustment),
          salesZeroAmount: getNum(parsed.salesZeroAmount),
          salesZeroAdjustment: getNum(parsed.salesZeroAdjustment),
          salesExemptAmount: getNum(parsed.salesExemptAmount),
          salesExemptAdjustment: getNum(parsed.salesExemptAdjustment),
          
          purchaseVatAmount: getNum(parsed.purchaseVatAmount),
          purchaseVatAdjustment: getNum(parsed.purchaseVatAdjustment),
          purchaseZeroAmount: getNum(parsed.purchaseZeroAmount),
          purchaseZeroAdjustment: getNum(parsed.purchaseZeroAdjustment),
          purchaseExemptAmount: getNum(parsed.purchaseExemptAmount),
          purchaseExemptAdjustment: getNum(parsed.purchaseExemptAdjustment),
          
          journalVatAmount: getNum(parsed.journalVat),
          vatCreditCarried: getNum(parsed.vatCreditCarried),
          corrections: getNum(parsed.corrections),
        }));
        setActiveTab('overview');

      } catch (error: any) {
        const isQuotaError = error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED");
        
        if (isQuotaError && retryCount < 2) {
          // Wait 3 seconds and retry
          await new Promise(resolve => setTimeout(resolve, 3000));
          return performExtraction(retryCount + 1);
        }

        console.error("PDF Extraction Error:", error);
        
        if (error?.message?.includes("API_KEY_MISSING")) {
          setErrorMsg("API Key Missing: Please go to Repository Settings > Secrets and add 'GEMINI_API_KEY'.");
        } else if (error?.message?.includes("API key not valid")) {
          setErrorMsg("Invalid API Key: The key you provided is not valid for Gemini API.");
        } else if (error?.message?.includes("model") && error?.message?.includes("not found")) {
          setErrorMsg("AI Model Error: The requested model is not available. Please try again later.");
        } else {
          // If it's a JSON parse error or something else, show a hint
          const details = error?.message ? `: ${error.message}` : "";
          setErrorMsg(isQuotaError
            ? "The AI service is currently at maximum capacity. Please wait a moment and try again." 
            : `Failed to extract data${details}. Ensure the PDF is a valid ZATCA tax document.`
          );
        }
      } finally {
        setIsParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    await performExtraction();
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-800 font-sans selection:bg-blue-100">
      
      {/* Parsing Overlay */}
      <AnimatePresence>
        {isParsing && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 print:hidden"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-xs w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 mx-auto mb-6 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <FileSearch className="text-white animate-pulse" size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Processing PDF</h3>
              <p className="text-sm text-slate-400 mt-2">Gemini AI is analyzing your tax document...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print-Only Report View */}
      <div className="hidden print:block p-12 bg-white text-slate-900">
        <div className="flex justify-between items-start mb-12 border-b-2 border-slate-900 pb-8">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">KSA VAT Audit Report</h1>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest leading-none">Professional VAT Audit Tool</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{data.companyName || 'N/A'}</p>
            <p className="text-sm text-slate-500 font-mono">VAT ID: {data.taxNumber || 'N/A'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8 mb-12">
          <div className="border-l-4 border-slate-200 pl-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tax Period</p>
            <p className="text-sm font-bold">{data.quarter || 'N/A'}</p>
          </div>
          <div className="border-l-4 border-slate-200 pl-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">From Date</p>
            <p className="text-sm font-bold">{data.fromDate || 'N/A'}</p>
          </div>
          <div className="border-l-4 border-slate-200 pl-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">To Date</p>
            <p className="text-sm font-bold">{data.toDate || 'N/A'}</p>
          </div>
        </div>

        <div className="space-y-12">
          {/* Sales Table Print */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Sales Summary</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b-2 border-slate-900">
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2 text-right">Adjustment</th>
                  <th className="py-2 text-right">VAT Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr><td className="py-2">Standard Rated (15%)</td><td className="py-2 text-right font-mono">{formatCurrency(data.salesVatAmount)}</td><td className="py-2 text-right font-mono text-red-600">-{formatCurrency(Math.abs(data.salesVatAdjustment))}</td><td className="py-2 text-right font-mono font-bold">{formatCurrency(round((data.salesVatAmount - Math.abs(data.salesVatAdjustment)) * VAT_RATE))}</td></tr>
                <tr><td className="py-2">Zero Rated</td><td className="py-2 text-right font-mono">{formatCurrency(data.salesZeroAmount)}</td><td className="py-2 text-right font-mono text-red-600">-{formatCurrency(Math.abs(data.salesZeroAdjustment))}</td><td className="py-2 text-right font-mono">0.00</td></tr>
                <tr><td className="py-2">Tax Exempt</td><td className="py-2 text-right font-mono">{formatCurrency(data.salesExemptAmount)}</td><td className="py-2 text-right font-mono text-red-600">-{formatCurrency(Math.abs(data.salesExemptAdjustment))}</td><td className="py-2 text-right font-mono">0.00</td></tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold">
                  <td className="py-2 uppercase">Total Sales</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(totals.salesTotalAmount)}</td>
                  <td className="py-2 text-right font-mono text-red-600">-{formatCurrency(Math.abs(totals.salesTotalAdjustment))}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(totals.salesVatDue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Purchases Table Print */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Purchases Summary</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b-2 border-slate-900">
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2 text-right">Adjustment</th>
                  <th className="py-2 text-right">VAT Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr><td className="py-2">Standard Rated (15%)</td><td className="py-2 text-right font-mono">{formatCurrency(data.purchaseVatAmount)}</td><td className="py-2 text-right font-mono text-red-600">-{formatCurrency(Math.abs(data.purchaseVatAdjustment))}</td><td className="py-2 text-right font-mono font-bold">{formatCurrency(round((data.purchaseVatAmount - Math.abs(data.purchaseVatAdjustment)) * VAT_RATE))}</td></tr>
                <tr><td className="py-2">Zero Rated</td><td className="py-2 text-right font-mono">{formatCurrency(data.purchaseZeroAmount)}</td><td className="py-2 text-right font-mono text-red-600">-{formatCurrency(Math.abs(data.purchaseZeroAdjustment))}</td><td className="py-2 text-right font-mono">0.00</td></tr>
                <tr><td className="py-2">Tax Exempt</td><td className="py-2 text-right font-mono">{formatCurrency(data.purchaseExemptAmount)}</td><td className="py-2 text-right font-mono text-red-600">-{formatCurrency(Math.abs(data.purchaseExemptAdjustment))}</td><td className="py-2 text-right font-mono">0.00</td></tr>
                <tr className="italic"><td className="py-2 text-blue-800">Manual Journal Entry VAT</td><td className="py-2 text-right font-mono text-slate-400">{formatCurrency(totals.journalPrincipal)} (Principal)</td><td className="py-2"></td><td className="py-2 text-right font-mono font-bold">{formatCurrency(data.journalVatAmount)}</td></tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold">
                  <td className="py-2 uppercase">Total Purchases</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(totals.purchaseTotalAmount)}</td>
                  <td className="py-2 text-right font-mono text-red-600">-{formatCurrency(Math.abs(totals.purchaseTotalAdjustment))}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(totals.purchaseVatPaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Final Results Print */}
          <div className="bg-slate-50 p-8 rounded-2xl border-2 border-slate-200">
            <h3 className="text-xs font-black uppercase tracking-widest mb-6 text-center">Net Settlement Calculation</h3>
            <div className="grid grid-cols-2 gap-y-4 max-w-sm mx-auto">
               <p className="text-slate-500 font-medium">VAT Due (Sales)</p>
               <p className="text-right font-mono font-bold">{formatCurrency(totals.salesVatDue)}</p>
               
               <p className="text-slate-500 font-medium">VAT Paid (Purchases)</p>
               <p className="text-right font-mono font-bold text-emerald-600">-{formatCurrency(totals.purchaseVatPaid)}</p>
               
               <p className="text-slate-500 font-medium italic underline underline-offset-4 decoration-slate-200">Current Period VAT</p>
               <p className="text-right font-mono font-black">{formatCurrency(totals.currentVatDue)}</p>

               <div className="col-span-2 h-px bg-slate-200 my-2" />

               <p className="text-slate-500 font-medium">Brought Forward Credit</p>
               <p className="text-right font-mono text-red-500">-{formatCurrency(data.vatCreditCarried)}</p>
               
               <p className="text-slate-500 font-medium">Corrections</p>
               <p className="text-right font-mono text-blue-600">+{formatCurrency(data.corrections)}</p>

               <div className="col-span-2 h-1 bg-slate-900 mt-4" />
               
               <p className="text-sm font-black uppercase mt-4">Net VAT Due</p>
               <p className={`text-2xl font-mono font-black text-right mt-4 ${totals.netVatDue >= 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                 {formatCurrency(totals.netVatDue)}
               </p>
            </div>
            {totals.netVatDue < 0 && (
              <p className="mt-8 text-center text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Refundable Credit Position</p>
            )}
          </div>
        </div>

        <div className="mt-12 text-center border-t border-slate-100 pt-8">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
            Developed by <a href="https://www.morshedul.iam.bd" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 transition-colors underline decoration-slate-200 underline-offset-2">Muhammad Morshedul Islam</a>
          </p>
          <p className="text-[9px] text-slate-300 font-medium uppercase tracking-tighter italic">© 2024–2026. All rights reserved.</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-4xl mx-auto min-h-screen flex flex-col bg-white md:shadow-2xl md:my-8 md:rounded-[2rem] md:border md:border-slate-200 overflow-hidden relative print:hidden">
        
        {/* Sticky Header */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-5 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-slate-900 rounded-lg">
                <Calculator size={20} className="text-white" />
             </div>
             <h1 className="font-bold tracking-tight text-lg">KSA VAT Auditor</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="Import PDF"
            >
              <Upload size={22} />
            </button>
            <button 
              onClick={clearAll}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              title="Reset"
            >
              <Trash2 size={22} />
            </button>
          </div>
          <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
        </header>

        {/* Global Error message */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="bg-red-50 text-red-600 px-6 py-3 text-xs font-semibold border-b border-red-100 flex items-center gap-2 overflow-hidden"
            >
              <AlertCircle size={14} />
              {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Navigation */}
        <nav className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto no-scrollbar flex gap-1">
          {[
            { id: 'overview', icon: Building2, label: 'Overview' },
            { id: 'sales', icon: Plus, label: 'Sales' },
            { id: 'purchases', icon: Database, label: 'Purchases' },
            { id: 'result', icon: CheckCircle2, label: 'Final Result' },
            { id: 'compare', icon: GitCompare, label: 'Compare' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id 
                ? "bg-blue-50 text-blue-600" 
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Dynamic Content Area */}
        <main className="flex-1 p-6 pb-24 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <SectionHeader title="Entity Metadata" icon={Building2} colorClass="bg-slate-800" />
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
                  <HeaderField label="Company Name" icon={Building2} value={data.companyName} onChange={(v: string) => setData({...data, companyName: v})} />
                  <HeaderField label="Tax Number / VAT ID" icon={Hash} value={data.taxNumber} onChange={(v: string) => setData({...data, taxNumber: v})} />
                  <div className="grid grid-cols-2 gap-4">
                    <HeaderField label="Quarter" icon={FileText} value={data.quarter} onChange={(v: string) => setData({...data, quarter: v})} />
                    <HeaderField label="From Date" icon={Calendar} type="date" value={data.fromDate} onChange={(v: string) => setData({...data, fromDate: v})} />
                  </div>
                  <HeaderField label="To Date" icon={Calendar} type="date" value={data.toDate} onChange={(v: string) => setData({...data, toDate: v})} />
                </div>
              </motion.div>
            )}

            {activeTab === 'sales' && (
              <motion.div 
                key="sales"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                       <Plus size={16} className="text-blue-600" />
                       Sales Section
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50/30 border-b border-slate-200">
                          <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Tax</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right">Sales Amount</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right">Adjustment</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right">VAT Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        <TableRow 
                          label="VAT" 
                          amount={data.salesVatAmount} 
                          adjustment={data.salesVatAdjustment} 
                          taxAmount={round((data.salesVatAmount - Math.abs(data.salesVatAdjustment)) * VAT_RATE)}
                          onAmountChange={(v) => setData({...data, salesVatAmount: v})}
                          onAdjustmentChange={(v) => setData({...data, salesVatAdjustment: v})}
                        />
                        <TableRow 
                          label="Zero Tax" 
                          amount={data.salesZeroAmount} 
                          adjustment={data.salesZeroAdjustment} 
                          taxAmount={0}
                          onAmountChange={(v) => setData({...data, salesZeroAmount: v})}
                          onAdjustmentChange={(v) => setData({...data, salesZeroAdjustment: v})}
                        />
                        <TableRow 
                          label="Tax Exempt" 
                          amount={data.salesExemptAmount} 
                          adjustment={data.salesExemptAdjustment} 
                          taxAmount={0}
                          onAmountChange={(v) => setData({...data, salesExemptAmount: v})}
                          onAdjustmentChange={(v) => setData({...data, salesExemptAdjustment: v})}
                        />
                      </tbody>
                      <tfoot>
                        <TableRow 
                          label="total" 
                          amount={totals.salesTotalAmount} 
                          adjustment={totals.salesTotalAdjustment} 
                          taxAmount={totals.salesVatDue}
                          isTotal
                        />
                      </tfoot>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'purchases' && (
              <motion.div 
                key="purchases"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                       <Database size={16} className="text-emerald-600" />
                       Purchases Section
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50/30 border-b border-slate-200">
                          <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase">Tax</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right">Purchases Amount</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right">Adjustment</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right">VAT Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        <TableRow 
                          label="VAT" 
                          amount={data.purchaseVatAmount} 
                          adjustment={data.purchaseVatAdjustment} 
                          taxAmount={round((data.purchaseVatAmount - Math.abs(data.purchaseVatAdjustment)) * VAT_RATE)}
                          onAmountChange={(v) => setData({...data, purchaseVatAmount: v})}
                          onAdjustmentChange={(v) => setData({...data, purchaseVatAdjustment: v})}
                        />
                        <TableRow 
                          label="Zero Tax" 
                          amount={data.purchaseZeroAmount} 
                          adjustment={data.purchaseZeroAdjustment} 
                          taxAmount={0}
                          onAmountChange={(v) => setData({...data, purchaseZeroAmount: v})}
                          onAdjustmentChange={(v) => setData({...data, purchaseZeroAdjustment: v})}
                        />
                        <TableRow 
                          label="Tax Exempt" 
                          amount={data.purchaseExemptAmount} 
                          adjustment={data.purchaseExemptAdjustment} 
                          taxAmount={0}
                          onAmountChange={(v) => setData({...data, purchaseExemptAmount: v})}
                          onAdjustmentChange={(v) => setData({...data, purchaseExemptAdjustment: v})}
                        />
                        {/* Manual Journal Row */}
                        <tr className="bg-blue-50/10 border-b border-slate-100 italic">
                          <td className="py-4 px-4 text-xs font-bold text-blue-700">Tax payments in Manual Journal Entries</td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Calculated Principal</span>
                              <span className="text-sm font-mono font-bold text-slate-700">
                                {totals.journalPrincipal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4"></td>
                          <td className="py-4 px-4 text-right">
                             <div className="flex flex-col items-end">
                              <span className="text-[9px] text-blue-400 font-bold uppercase mb-0.5">Edit VAT Amount</span>
                              <input 
                                type="number" 
                                value={data.journalVatAmount === 0 ? '' : data.journalVatAmount}
                                onChange={(e) => setData({...data, journalVatAmount: parseFloat(e.target.value) || 0})}
                                className="w-24 text-right bg-white border border-blue-200 focus:ring-1 focus:ring-blue-400 rounded px-2 py-1 text-sm font-mono font-bold text-blue-600"
                              />
                            </div>
                          </td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <TableRow 
                          label="total" 
                          amount={totals.purchaseTotalAmount} 
                          adjustment={totals.purchaseTotalAdjustment} 
                          taxAmount={totals.purchaseVatPaid}
                          isTotal
                        />
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <button 
                    onClick={() => setActiveTab('result')}
                    className="flex items-center justify-center gap-3 bg-slate-900 text-white py-4 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98]"
                  >
                    <FileText size={18} />
                    View Detailed Result
                  </button>
                  <button 
                    onClick={handlePrint}
                    className="flex items-center justify-center gap-3 bg-white text-slate-900 border-2 border-slate-200 py-4 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-[0.98]"
                  >
                    <Printer size={18} />
                    Quick Print Report
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === 'compare' && (
              <motion.div 
                key="compare"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <SectionHeader title="Comparison Engine" icon={GitCompare} colorClass="bg-indigo-600" />
                
                <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-10">
                      <GitCompare size={120} />
                   </div>
                   <div className="relative z-10">
                     <h3 className="text-lg font-bold mb-2">Compare Two Reports</h3>
                     <p className="text-slate-400 text-sm mb-6 max-w-sm">Select two saved drafts to see a side-by-side reconciliation of VAT figures.</p>
                     
                     <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="w-full space-y-2">
                           <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Report A</label>
                           <select 
                             className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                             value={compareIds?.[0] || 'current'}
                             onChange={(e) => setCompareIds([e.target.value, compareIds?.[1] || ''])}
                           >
                              <option value="current">Current Working Data (Active Session)</option>
                              {drafts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                           </select>
                        </div>
                        <div className="p-3 bg-slate-800 rounded-full text-indigo-400">
                           <GitCompare size={20} />
                        </div>
                        <div className="w-full space-y-2">
                           <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Report B</label>
                           <select 
                             className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                             value={compareIds?.[1] || ''}
                             onChange={(e) => setCompareIds([compareIds?.[0] || 'current', e.target.value])}
                           >
                              <option value="" disabled>Select a report...</option>
                              <option value="current">Current Working Data</option>
                              {drafts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                           </select>
                        </div>
                     </div>
                   </div>
                </div>

                {compareIds?.[0] && compareIds?.[1] && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                             <th className="py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Metric</th>
                             <th className="py-4 px-6 font-bold text-right text-indigo-600">
                               {compareIds[0] === 'current' ? 'Current' : drafts.find(d => d.id === compareIds[0])?.name}
                             </th>
                             <th className="py-4 px-6 font-bold text-right text-purple-600">
                               {compareIds[1] === 'current' ? 'Current' : drafts.find(d => d.id === compareIds[1])?.name}
                             </th>
                             <th className="py-4 px-6 font-bold text-right text-slate-900 border-l border-slate-100">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const reportA = compareIds[0] === 'current' ? data : drafts.find(d => d.id === compareIds[0])!;
                            const reportB = compareIds[1] === 'current' ? data : drafts.find(d => d.id === compareIds[1])!;
                            const totalsA = calculateTotals(reportA);
                            const totalsB = calculateTotals(reportB);

                            const metrics = [
                              { label: 'Sales VAT Due', valA: totalsA.salesVatDue, valB: totalsB.salesVatDue },
                              { label: 'Purchase VAT Paid', valA: totalsA.purchaseVatPaid, valB: totalsB.purchaseVatPaid },
                              { label: 'Net VAT Due', valA: totalsA.netVatDue, valB: totalsB.netVatDue, isMain: true },
                            ];

                            return metrics.map((m, idx) => {
                              const diff = m.valB - m.valA;
                              return (
                                <tr key={idx} className={`border-b border-slate-100 ${m.isMain ? 'bg-slate-50 font-bold' : ''}`}>
                                  <td className="py-4 px-6 text-slate-600">{m.label}</td>
                                  <td className="py-4 px-6 text-right font-mono">{formatCurrency(m.valA)}</td>
                                  <td className="py-4 px-6 text-right font-mono">{formatCurrency(m.valB)}</td>
                                  <td className={`py-4 px-6 text-right font-mono border-l border-slate-100 ${diff === 0 ? 'text-slate-300' : diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                    <History size={14} />
                    Saved Drafts ({drafts.length})
                  </h3>
                  {drafts.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                       <Database size={32} className="mx-auto text-slate-200 mb-4" />
                       <p className="text-sm font-bold text-slate-400">No drafts saved yet. Save reports from the Result lab.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {drafts.map(draft => (
                        <div key={draft.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-md transition-all group">
                           <div className="flex justify-between items-start mb-4">
                              <div>
                                <p className="font-bold text-slate-800">{draft.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{new Date(draft.timestamp).toLocaleString()}</p>
                              </div>
                              <button onClick={() => deleteDraft(draft.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 size={16} />
                              </button>
                           </div>
                           <div className="flex gap-2">
                              <button 
                                onClick={() => loadDraft(draft)}
                                className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                              >
                                Load
                              </button>
                              <button 
                                onClick={() => {
                                  setCompareIds([compareIds?.[0] || 'current', draft.id]);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="flex-1 border border-indigo-100 text-indigo-600 hover:bg-indigo-50 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                              >
                                Compare
                              </button>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            {activeTab === 'result' && (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Summary Statistics</h3>
                  </div>
                  <table className="w-full text-left">
                    <tbody>
                       <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                         <td className="py-5 px-6 text-sm font-semibold text-slate-700">Total VAT due of current period</td>
                         <td className="py-5 px-6 text-right font-mono font-bold text-slate-900">{formatCurrency(totals.currentVatDue)}</td>
                       </tr>
                       <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                         <td className="py-5 px-6 text-sm font-semibold text-slate-700">VAT Credit carried from previous period</td>
                         <td className="py-5 px-6 text-right">
                           <input 
                             type="number" 
                             value={data.vatCreditCarried === 0 ? '' : data.vatCreditCarried}
                             onChange={(e) => setData({...data, vatCreditCarried: parseFloat(e.target.value) || 0})}
                             className="w-32 text-right bg-slate-50 focus:bg-white border focus:ring-1 focus:ring-blue-100 px-3 py-2 rounded-xl font-mono text-sm font-bold"
                             placeholder="0.00"
                           />
                         </td>
                       </tr>
                       <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                         <td className="py-5 px-6 text-sm font-semibold text-slate-700">Corrections for previous period (-5000 to 5000)</td>
                         <td className="py-5 px-6 text-right">
                           <input 
                             type="number" 
                             value={data.corrections === 0 ? '' : data.corrections}
                             onChange={(e) => setData({...data, corrections: parseFloat(e.target.value) || 0})}
                             className="w-32 text-right bg-slate-50 focus:bg-white border focus:ring-1 focus:ring-blue-100 px-3 py-2 rounded-xl font-mono text-sm font-bold"
                             placeholder="0.00"
                           />
                         </td>
                       </tr>
                       <tr className="bg-slate-900 text-white">
                         <td className="py-8 px-6 text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Net VAT Due</td>
                         <td className={`py-8 px-6 text-right text-3xl font-mono font-black ${totals.netVatDue >= 0 ? 'text-blue-400' : 'text-emerald-400'}`}>
                           {formatCurrency(totals.netVatDue)}
                         </td>
                       </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    onClick={saveAsDraft}
                    className="w-full bg-white text-slate-700 border-2 border-slate-200 py-5 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm hover:shadow-md active:scale-[0.98] flex items-center justify-center gap-3 group"
                  >
                    <Save size={18} className="group-hover:scale-110 transition-transform" />
                    Save as Draft
                  </button>
                  <button 
                    onClick={handlePrint}
                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl hover:shadow-2xl active:scale-[0.98] flex items-center justify-center gap-3"
                  >
                    <Printer size={18} />
                    Print Tax Return Report
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Global Stats Footer */}
        <footer className="bg-white border-t border-slate-200 flex justify-around py-4 px-6 z-40 shadow-[0_-10px_20px_rgba(0,0,0,0.02)] md:rounded-b-[2rem]">
           <div className="text-center group">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Output VAT</p>
             <p className="text-sm font-mono font-bold text-blue-600">{formatCurrency(totals.salesVatDue)}</p>
           </div>
           <div className="w-px h-8 bg-slate-100 self-center" />
           <div className="text-center group">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Input VAT</p>
             <p className="text-sm font-mono font-bold text-emerald-600">{formatCurrency(totals.purchaseVatPaid)}</p>
           </div>
           <div className="w-px h-8 bg-slate-100 self-center" />
           <div className="text-center group">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Net Balance</p>
             <p className={`text-sm font-mono font-bold ${totals.netVatDue >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
               {formatCurrency(totals.netVatDue)}
             </p>
           </div>
        </footer>

        <div className="py-6 px-6 text-center border-t border-slate-50 bg-slate-50/30">
          <p className="text-[9px] text-slate-400 font-medium mb-1">
            Developed by <a href="https://www.morshedul.iam.bd" target="_blank" rel="noopener noreferrer" className="text-slate-600 font-bold hover:text-blue-600 transition-all underline decoration-slate-200 underline-offset-2 hover:decoration-blue-200">Muhammad Morshedul Islam</a>
          </p>
          <p className="text-[9px] text-slate-300 font-medium uppercase tracking-tighter italic">
            © 2024–2026. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

