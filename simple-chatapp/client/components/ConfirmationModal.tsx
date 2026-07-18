import React from "react";

export interface PendingAction {
  toolName: string;
  toolInput: Record<string, any>;
}

interface ConfirmationModalProps {
  action: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  "mcp__stock-mcp__create_zeroization": "Product Zeroisation",
  "mcp__stock-mcp__create_area_zeroization": "Area Zeroisation",
  "mcp__stock-mcp__create_adjustment": "Stock Adjustment",
  "mcp__admin-mcp__set_associate_threshold": "Set Associate Threshold",
};

const ACTION_DESCRIPTIONS: Record<string, string> = {
  "mcp__stock-mcp__create_zeroization":
    "This will write off the entire on-hand quantity of this product to zero.",
  "mcp__stock-mcp__create_area_zeroization":
    "This will write off all on-hand stock across every product in this area to zero.",
  "mcp__stock-mcp__create_adjustment":
    "This will permanently reduce the on-hand quantity of this product.",
  "mcp__admin-mcp__set_associate_threshold":
    "This will update the stock-adjustment quota for this associate.",
};

const FIELD_LABELS: Record<string, string> = {
  productId: "Product ID",
  areaId: "Area ID",
  quantity: "Reduce by (units)",
  requestedQuantity: "Reduce by (units)",
  reason: "Reason",
  associateId: "Associate ID",
  employeeId: "Associate ID",
  thresholdPercent: "New Threshold",
};

function formatValue(key: string, value: any): string {
  if (key === "thresholdPercent") return `${value}%`;
  return String(value);
}

export function ConfirmationModal({ action, onConfirm, onCancel }: ConfirmationModalProps) {
  const label = ACTION_LABELS[action.toolName] ?? action.toolName;
  const description = ACTION_DESCRIPTIONS[action.toolName];

  const displayFields = Object.entries(action.toolInput).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-start gap-3">
          <span className="text-amber-500 text-2xl leading-none mt-0.5">&#9888;</span>
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">Confirm {label}</h2>
            {description && (
              <p className="text-sm text-gray-600 mt-1">{description}</p>
            )}
          </div>
        </div>

        {/* Action details */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Action details
          </p>
          <dl className="space-y-2">
            {displayFields.map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-gray-500 shrink-0">
                  {FIELD_LABELS[key] ?? key}
                </dt>
                <dd className="text-sm font-semibold text-gray-900 text-right break-all">
                  {formatValue(key, value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Warning */}
        <div className="px-6 pb-4">
          <p className="text-xs text-red-600 font-medium">
            This action cannot be undone. Please verify the details above before confirming.
          </p>
        </div>

        {/* Buttons */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
