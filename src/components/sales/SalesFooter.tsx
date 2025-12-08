"use client";

import React from 'react';
import Link from 'next/link';
import { Instagram } from 'lucide-react';

export function SalesFooter() {
    return (
        <footer className="bg-background border-t border-border py-12 md:py-16">
            <div className="container px-4 md:px-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">

                    <div className="col-span-1 md:col-span-1">
                        <div className="w-40 h-16 mb-4 relative">
                            <img
                                src="/lagosta-logo.png"
                                alt="Lagosta Criativa"
                                className="w-full h-full object-contain object-left"
                            />
                        </div>
                        <p className="text-sm text-muted-foreground mt-4">
                            Marketing Gastronômico Especializado. Backend de crescimento para restaurantes.
                        </p>
                        <div className="flex gap-4 mt-6">
                            <Link href="https://www.instagram.com/lagostacriativa/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-orange-500 transition-colors">
                                <Instagram className="h-5 w-5" />
                            </Link>
                        </div>
                    </div>

                    <div className="col-span-1 md:col-span-2 md:pl-12">
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <h4 className="font-bold mb-4">Empresa</h4>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    <li><Link href="#cases" className="hover:text-foreground">Casos de Sucesso</Link></li>
                                    <li><Link href="#pricing" className="hover:text-foreground">Planos</Link></li>
                                    <li><Link href="#" className="hover:text-foreground">Sobre nós</Link></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-1">
                        <h4 className="font-bold mb-4">Contato</h4>
                        <address className="not-italic text-sm text-muted-foreground space-y-2">
                            <p>Vitória, ES</p>
                            <p>contato@lagostacriativa.com.br</p>
                            <p className="mt-4 text-xs opacity-50">CNPJ: 21.339.876/0001-37</p>
                        </address>
                        <p className="text-xs text-muted-foreground mt-4">Responsável Técnico: Ciro Trigo</p>
                    </div>

                </div>

                <div className="border-t border-border pt-8 text-center text-xs text-muted-foreground flex flex-col md:flex-row justify-between items-center gap-4">
                    <p>&copy; {new Date().getFullYear()} Lagosta Criativa. Todos os direitos reservados.</p>
                    <p>Desenvolvido com <span className="text-orange-500">❤</span> por Lagosta Tech</p>
                </div>
            </div>
        </footer>
    );
}
