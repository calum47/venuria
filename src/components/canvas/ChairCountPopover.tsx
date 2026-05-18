'use client'

type Props = {
  tableId: string
  tableName: string
  onConfirm: (chairCount: number) => void
  onSkip: () => void
}

export default function ChairCountPopover({ tableName, onConfirm, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900">Chairs around this table?</h3>
          <p className="text-sm text-gray-500 mt-0.5">{tableName}</p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[2, 4, 6, 8, 10, 12, 14, 16].map((count) => (
            <button
              key={count}
              onClick={() => onConfirm(count)}
              className="py-2 text-sm font-medium border border-gray-200 rounded-lg
                         hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700
                         transition-colors"
            >
              {count}
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onSkip}
            className="flex-1 py-2 text-sm text-gray-500 border border-gray-200
                       rounded-lg hover:bg-gray-50 transition-colors"
          >
            No chairs
          </button>
        </div>
      </div>
    </div>
  )
}