import { type Metadata } from "next";

export const metadata: Metadata = {
    title: "Termos de Serviço | Studio Lagosta",
    description: "Termos de Serviço e condições de uso do Studio Lagosta.",
};

export default function TermsOfServicePage() {
    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl text-foreground">
            <h1 className="text-4xl font-bold mb-8">Termos de Serviço</h1>

            <div className="space-y-6">
                <section>
                    <p className="text-muted-foreground mb-4">
                        Última atualização: {new Date().toLocaleDateString('pt-BR')}
                    </p>
                    <p className="leading-relaxed">
                        Ao acessar o site e aplicativos do Studio Lagosta, você concorda em cumprir estes termos de serviço, todas as leis e regulamentos aplicáveis ​​e concorda que é responsável pelo cumprimento de todas as leis locais aplicáveis. Se você não concordar com algum desses termos, está proibido de usar ou acessar este site.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">1. Licença de Uso</h2>
                    <p className="mb-4 leading-relaxed">
                        É concedida permissão para baixar temporariamente uma cópia dos materiais (informações ou software) no site Studio Lagosta, apenas para visualização transitória pessoal e não comercial. Esta é a concessão de uma licença, não uma transferência de título e, sob esta licença, você não pode:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Modificar ou copiar os materiais;</li>
                        <li>Usar os materiais para qualquer finalidade comercial ou para exibição pública (comercial ou não comercial);</li>
                        <li>Tentar descompilar ou fazer engenharia reversa de qualquer software contido no site Studio Lagosta;</li>
                        <li>Remover quaisquer direitos autorais ou outras notações de propriedade dos materiais; ou</li>
                        <li>Transferir os materiais para outra pessoa ou 'espelhe' os materiais em qualquer outro servidor.</li>
                    </ul>
                    <p className="mt-4 leading-relaxed">
                        Esta licença será automaticamente rescindida se você violar alguma dessas restrições e poderá ser rescindida pelo Studio Lagosta a qualquer momento.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">2. Isenção de Responsabilidade</h2>
                    <p className="mb-4 leading-relaxed">
                        Os materiais no site da Studio Lagosta são fornecidos 'como estão'. Studio Lagosta não oferece garantias, expressas ou implícitas, e, por este meio, isenta e nega todas as outras garantias, incluindo, sem limitação, garantias implícitas ou condições de comercialização, adequação a um fim específico ou não violação de propriedade intelectual ou outra violação de direitos.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">3. Limitações</h2>
                    <p className="mb-4 leading-relaxed">
                        Em nenhum caso o Studio Lagosta ou seus fornecedores serão responsáveis ​​por quaisquer danos (incluindo, sem limitação, danos por perda de dados ou lucro ou devido a interrupção dos negócios) decorrentes do uso ou da incapacidade de usar os materiais em Studio Lagosta, mesmo que Studio Lagosta ou um representante autorizado da Studio Lagosta tenha sido notificado oralmente ou por escrito da possibilidade de tais danos.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">4. Precisão dos Materiais</h2>
                    <p className="mb-4 leading-relaxed">
                        Os materiais exibidos no site da Studio Lagosta podem incluir erros técnicos, tipográficos ou fotográficos. Studio Lagosta não garante que qualquer material em seu site seja preciso, completo ou atual. Studio Lagosta pode fazer alterações nos materiais contidos em seu site a qualquer momento, sem aviso prévio.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">5. Links</h2>
                    <p className="mb-4 leading-relaxed">
                        O Studio Lagosta não analisou todos os sites vinculados ao seu site e não é responsável pelo conteúdo de nenhum site vinculado. A inclusão de qualquer link não implica endosso por Studio Lagosta do site. O uso de qualquer site vinculado é por conta e risco do usuário.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">6. Modificações</h2>
                    <p className="mb-4 leading-relaxed">
                        O Studio Lagosta pode revisar estes termos de serviço do site a qualquer momento, sem aviso prévio. Ao usar este site, você concorda em ficar vinculado à versão atual desses termos de serviço.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">7. Lei Aplicável</h2>
                    <p className="mb-4 leading-relaxed">
                        Estes termos e condições são regidos e interpretados de acordo com as leis do Brasil e você se submete irrevogavelmente à jurisdição exclusiva dos tribunais naquele estado ou localidade.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">8. Contato</h2>
                    <p className="mb-4 leading-relaxed">
                        Para dúvidas sobre estes termos, entre em contato:
                    </p>
                    <address className="not-italic">
                        <strong>Studio Lagosta</strong><br />
                        Email: <a href="mailto:contato@studiolagosta.com.br" className="text-primary hover:underline">contato@studiolagosta.com.br</a>
                    </address>
                </section>
            </div>
        </div>
    );
}
