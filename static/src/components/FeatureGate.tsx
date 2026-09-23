import { ReactNode } from 'react';
import { PlanLimits } from '@/context/PlanContext';

interface FeatureGateProps {
    feature: keyof PlanLimits;
    featureName: string;
    children: ReactNode;
    fallback?: ReactNode;
    requiredPlan?: 'pro' | 'premium';
}

const FeatureGate = ({ children }: FeatureGateProps) => <>{children}</>;

export default FeatureGate;
