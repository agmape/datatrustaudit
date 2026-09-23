const LoadingSkeleton = () => {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header Skeleton */}
            <div className="h-16 bg-gradient-to-r from-gray-200 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl" />

            {/* Form Card Skeleton */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600" />
                    <div className="space-y-2">
                        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                        <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 rounded" />
                    </div>
                </div>

                {/* Tabs Skeleton */}
                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className={`flex-1 h-12 rounded-lg ${i === 1 ? 'bg-white dark:bg-gray-700' : 'bg-transparent'}`}
                        />
                    ))}
                </div>

                {/* Input Skeleton */}
                <div className="flex gap-3">
                    <div className="flex-1 h-14 bg-gray-100 dark:bg-gray-800 rounded-xl" />
                    <div className="w-32 h-14 bg-gradient-to-r from-blue-200 to-indigo-200 dark:from-blue-900 dark:to-indigo-900 rounded-xl" />
                </div>

                {/* Option Skeleton */}
                <div className="h-16 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900" />

                {/* Info Cards Skeleton */}
                <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-24 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export const ResultsSkeleton = () => {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header Card Skeleton */}
            <div className="rounded-2xl bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-950 dark:to-indigo-950 p-6">
                <div className="flex justify-between items-start">
                    <div className="space-y-3">
                        <div className="h-8 w-64 bg-white/50 dark:bg-gray-700/50 rounded-lg" />
                        <div className="h-5 w-48 bg-white/30 dark:bg-gray-700/30 rounded" />
                    </div>
                    <div className="w-24 h-24 rounded-full bg-white/50 dark:bg-gray-700/50" />
                </div>

                {/* Stats Skeleton */}
                <div className="grid grid-cols-4 gap-4 mt-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-20 bg-white/30 dark:bg-gray-700/30 rounded-lg"
                        />
                    ))}
                </div>
            </div>

            {/* Tabs Skeleton */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className={`flex-1 h-10 rounded-lg ${i === 1 ? 'bg-white dark:bg-gray-700' : 'bg-transparent'}`}
                        />
                    ))}
                </div>

                {/* Content Skeleton */}
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-32 bg-gray-50 dark:bg-gray-800 rounded-xl"
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export const ChartSkeleton = () => {
    return (
        <div className="w-full h-64 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-blue-500 animate-spin" />
                <span className="text-sm text-gray-400">Carregando gráfico...</span>
            </div>
        </div>
    );
};

export default LoadingSkeleton;
