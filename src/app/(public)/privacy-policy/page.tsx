import { type Metadata } from "next";

export const metadata: Metadata = {
    title: "Política de Privacidade | Studio Lagosta",
    description: "Política de Privacidade do aplicativo e serviços do Studio Lagosta.",
};

export default function PrivacyPolicyPage() {
    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl text-foreground">
            <h1 className="text-4xl font-bold mb-8">Política de Privacidade</h1>

            <div className="space-y-6">
                <section>
                    <p className="text-muted-foreground mb-4">
                        Última atualização: {new Date().toLocaleDateString('pt-BR')}
                    </p>
                    <p className="leading-relaxed">
                        Esta Política de Privacidade descreve como o Studio Lagosta ("nós", "nosso" ou "empresa") coleta, usa e protege suas informações ao utilizar nosso site e aplicativos, incluindo integrações com o Facebook.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">1. Informações que Coletamos</h2>
                    <p className="mb-4 leading-relaxed">
                        Ao utilizar nossos serviços e aplicativos, podemos coletar os seguintes tipos de informações:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Informações de Conta:</strong> Nome, endereço de e-mail e foto de perfil, obtidos mediante sua permissão através do login social (Facebook/Google).</li>
                        <li><strong>Dados de Uso:</strong> Informações sobre como você interage com nossos serviços, datas e horários de acesso.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">2. Como Usamos Suas Informações</h2>
                    <p className="mb-4 leading-relaxed">
                        Utilizamos as informações coletadas para:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Fornecer, operar e manter nossos serviços;</li>
                        <li>Melhorar, personalizar e expandir nossos serviços;</li>
                        <li>Entender e analisar como você usa nossos serviços;</li>
                        <li>Comunicar com você, seja diretamente ou através de um dos nossos parceiros, para atendimento ao cliente e atualizações;</li>
                        <li>Enviar e-mails e notificações relevantes ao uso da plataforma.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">3. Compartilhamento de Dados</h2>
                    <p className="mb-4 leading-relaxed">
                        Não vendemos, trocamos ou transferimos suas informações pessoais para terceiros, exceto quando necessário para fornecer o serviço (ex: provedores de hospedagem) ou quando exigido por lei.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">4. Dados do Facebook</h2>
                    <p className="mb-4 leading-relaxed">
                        Para aplicativos que utilizam login do Facebook:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Coletamos apenas as informações públicas do seu perfil e e-mail que você autorizar expressamente.</li>
                        <li>Não publicamos conteúdo em seu nome sem sua permissão explícita.</li>
                        <li>Você pode revogar o acesso ao nosso aplicativo a qualquer momento através das configurações do Facebook.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">5. Seus Direitos e Exclusão de Dados</h2>
                    <p className="mb-4 leading-relaxed">
                        De acordo com a Lei Geral de Proteção de Dados (LGPD) e outras regulamentações aplicáveis, você tem o direito de:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Acessar seus dados pessoais;</li>
                        <li>Corrigir dados imprecisos;</li>
                        <li>Solicitar a exclusão de seus dados.</li>
                    </ul>
                    <div className="bg-muted p-6 rounded-lg mt-6 border border-border">
                        <p className="font-semibold mb-2">Instruções para Exclusão de Dados:</p>
                        <p className="text-sm">
                            Caso deseje que seus dados sejam removidos de nossa base, entre em contato conosco pelo e-mail <strong>contato@studiolagosta.com.br</strong> com o assunto "Exclusão de Dados". Processaremos sua solicitação em até 30 dias.
                        </p>
                    </div>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">6. Contato</h2>
                    <p className="mb-4 leading-relaxed">
                        Se você tiver alguma dúvida sobre esta Política de Privacidade, entre em contato conosco:
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
