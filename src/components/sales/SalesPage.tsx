"use client";

import React from 'react';
import { HeroSection } from './HeroSection';
import { ProblemSection } from './ProblemSection';
import { SolutionSection } from './SolutionSection';
import { ValuePropSection } from './ValuePropSection';
import { MethodologySection } from './MethodologySection';
import { CaseStudiesSection } from './CaseStudiesSection';
import { OfferSection } from './OfferSection';
import { SocialProofSection } from './SocialProofSection';
import { ObjectionsSection } from './ObjectionsSection';
import { CtaSection } from './CtaSection';
import { SalesFooter } from './SalesFooter';

export function SalesPage() {
    return (
        <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
            <HeroSection />
            <ProblemSection />
            <SolutionSection />
            <ValuePropSection />
            <MethodologySection />
            <CaseStudiesSection />
            <OfferSection />
            <SocialProofSection />
            <ObjectionsSection />
            <CtaSection />
            <SalesFooter />
        </main>
    );
}
