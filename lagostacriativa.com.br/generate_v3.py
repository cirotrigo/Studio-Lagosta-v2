import re

with open("design-system.html", "r", encoding="utf-8") as f:
    content = f.read()

# find up to the <section id="social" class="ds-section-title">
match = re.search(r'(<section id="social" class="ds-section-title">.*?)(</div>\s*</section>\s*</div>\s*<footer)', content, re.DOTALL)

if not match:
    print("Could not find section id='social'")
    exit(1)

social_content = """<section id="social" class="ds-section-title">
                <h2 class="text-3xl font-bold text-orange-500 mb-2">7) Instagram Assets: Designer's Master Guide</h2>
                <p class="text-muted-foreground mb-8">Estratégias visuais rigorosas para Feed e Stories. Foque no contraste e proporção (Limites de 30% texto).</p>

                <!-- Diretrizes -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
                    <div class="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl">
                        <h3 class="text-xl font-bold mb-4 flex items-center gap-2"><svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg> Layout & Safe Zones</h3>
                        <ul class="space-y-4 text-sm text-zinc-400">
                            <li><strong class="text-white">Stories & Reels (9:16):</strong> <br>Margin Top: min 15% / Bottom: min 18% / Sides: min 8%. Text within this zone only.</li>
                            <li><strong class="text-white">Feed Formats:</strong> <br>Use 3:4 (1080x1440) for max retention, 4:5 (1080x1350) for lifestyle, or 1:1 for clean quotes.</li>
                            <li><strong class="text-white">Regra dos 30%:</strong> <br>Textos e gradientes nunca devem ultrapassar 30% da altura total da arte. Deixe o produto respirar.</li>
                        </ul>
                    </div>

                    <div class="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl">
                        <h3 class="text-xl font-bold mb-4 flex items-center gap-2"><svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg> Tipografia & Balanceamento</h3>
                        <ul class="space-y-4 text-sm text-zinc-400">
                            <li><strong class="text-white">Tipografia:</strong> <br>'Coolvetica' para Títulos H1/H2 e 'Yanone Kaffeesatz' para Tags e Pré-títulos.</li>
                            <li><strong class="text-white">Line Heights:</strong> <br>Usar <code>line-height: 0.85</code> em títulos para criar blocos sólidos de texto puro.</li>
                            <li><strong class="text-white">Text Wrapping Proporcional:</strong> <br>Quebre as linhas com <code>&lt;br&gt;</code> para equilibrar o número de palavras por linha (ex: 5 em cima, 4 embaixo). Sem "órfãos".</li>
                        </ul>
                    </div>
                </div>

                <div class="social-display">
                    <!-- STORY 1: Centered Focus (Promotion/Event) -->
                    <div class="flex flex-col items-center gap-4">
                        <p class="text-xs uppercase tracking-widest text-zinc-500 font-bold">1. Story: Centered Focus</p>
                        <div class="ig-asset ig-story relative group">
                            <div class="absolute inset-0 border-[2px] border-dashed border-red-500/50 opacity-0 group-hover:opacity-100 transition pointer-events-none z-50" style="margin: 15% 8% 18% 8%; border-radius: 8px;"><span class="absolute -top-5 left-0 text-[8px] text-red-500 font-bold uppercase">Safe Zone</span></div>
                            <img src="assets/media__1773025405752.jpg" class="ig-img" alt="Gourmet Dish">
                            <div class="ig-overlay-top" style="height: 45%;"></div>
                            <div class="ig-overlay-bottom" style="height: 45%;"></div>

                            <div class="ig-overlay-full items-center text-center">
                                <div class="flex flex-col items-center gap-4 w-full">
                                    <img src="assets/lagosta-logo_4a75b9ab6d10.png" class="h-6 w-auto object-contain" alt="Logo">
                                    <div class="flex flex-col items-center">
                                        <p class="text-[14px] font-medium tracking-[0.05em] text-white uppercase font-yanone -mb-1">Terça & Quarta Especial</p>
                                        <h3 class="text-[34px] font-black text-orange-500 uppercase font-coolvetica" style="line-height: 0.85;">Festival de<br>Frutos do Mar</h3>
                                    </div>
                                </div>

                                <div class="flex flex-col items-center gap-2.5 w-full">
                                    <p class="text-[12px] text-white leading-snug uppercase tracking-wider font-yanone mb-1.5 px-4">Uma experiência impecável<br>feita para o seu paladar exigente</p>
                                    <div class="w-full h-10 bg-orange-600 rounded flex items-center justify-center text-xs font-bold text-white uppercase tracking-wider shadow-lg">Reservar Mesa</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- STORY 2: Asymmetric Left-Aligned -->
                    <div class="flex flex-col items-center gap-4">
                        <p class="text-xs uppercase tracking-widest text-zinc-500 font-bold">2. Story: Asymmetric Left</p>
                        <div class="ig-asset ig-story relative group">
                            <div class="absolute inset-0 border-[2px] border-dashed border-red-500/50 opacity-0 group-hover:opacity-100 transition pointer-events-none z-50" style="margin: 15% 8% 18% 8%; border-radius: 8px;"><span class="absolute -top-5 left-0 text-[8px] text-red-500 font-bold uppercase">Safe Zone</span></div>
                            <img src="assets/media__1773025405754.jpg" class="ig-img" alt="Restaurant Scene">
                            <div class="ig-overlay-top" style="height: 40%;"></div>
                            <div class="ig-overlay-bottom" style="height: 45%;"></div>

                            <div class="ig-overlay-full items-start text-left">
                                <div class="flex flex-col items-start gap-4 w-full">
                                    <img src="assets/lagosta-logo_4a75b9ab6d10.png" class="h-5 w-auto object-contain mb-1" alt="Logo">
                                    <div class="flex flex-col items-start">
                                        <p class="text-[13px] font-medium tracking-widest text-white uppercase font-yanone">Por trás dos bastidores</p>
                                        <h3 class="text-4xl font-black text-orange-500 uppercase font-coolvetica" style="line-height: 0.85;">Fotografia<br>Profissional</h3>
                                    </div>
                                </div>

                                <div class="w-full flex flex-col items-end text-right gap-3">
                                    <p class="text-[12px] text-zinc-100 max-w-[85%] leading-snug font-yanone">Capture a essência autêntica<br>da sua gastronomia hoje</p>
                                    <div class="h-9 px-6 bg-white text-black rounded flex items-center justify-center text-[10px] font-black uppercase tracking-widest shadow-lg">Saiba Mais</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- STORY 3: Text-Heavy Quote/List -->
                    <div class="flex flex-col items-center gap-4">
                        <p class="text-xs uppercase tracking-widest text-zinc-500 font-bold">3. Story: Info Balanced</p>
                        <div class="ig-asset ig-story relative group">
                            <div class="absolute inset-0 border-[2px] border-dashed border-red-500/50 opacity-0 group-hover:opacity-100 transition pointer-events-none z-50" style="margin: 15% 8% 18% 8%; border-radius: 8px;"><span class="absolute -top-5 left-0 text-[8px] text-red-500 font-bold uppercase">Safe Zone</span></div>
                            <img src="assets/media__1773025412903.jpg" class="ig-img" alt="Experience">
                            <div class="ig-overlay-top" style="height: 45%;"></div>
                            <div class="ig-overlay-bottom" style="height: 45%;"></div>

                            <div class="ig-overlay-full items-center justify-center text-center">
                                <img src="assets/lagosta-logo_4a75b9ab6d10.png" class="absolute top-[15%] h-5 w-auto object-contain" alt="Logo">
                                
                                <div class="flex flex-col items-center gap-6 mt-16 w-full px-2">
                                    <h3 class="text-3xl font-black text-white uppercase font-coolvetica" style="line-height: 0.85;">Marketing Real<br><span class="text-orange-500">Resultados Reais</span></h3>
                                    
                                    <div class="flex flex-col items-start text-left w-full gap-3 font-yanone text-sm text-zinc-300">
                                        <div class="flex gap-2"><svg class="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span>Posicionamento Elegante</span></div>
                                        <div class="flex gap-2"><svg class="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span>Imagens Genuínas</span></div>
                                        <div class="flex gap-2"><svg class="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span>Escala de Vendas</span></div>
                                    </div>
                                </div>

                                <div class="absolute bottom-[18%] w-[84%] flex items-center justify-center gap-1.5 text-[10px] text-zinc-300 font-medium uppercase tracking-widest bg-black/40 py-2 rounded-full border border-white/10 backdrop-blur-md">
                                    <svg class="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                    Conheça o método
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- FEED 1: Product Highlight (3:4) -->
                    <div class="flex flex-col items-center gap-4">
                        <p class="text-xs uppercase tracking-widest text-zinc-500 font-bold">4. Feed: Product (3:4)</p>
                        <div class="ig-asset w-full max-w-[320px] aspect-[3/4] relative group">
                            <img src="assets/media__1773025412927.jpg" class="ig-img" alt="Feed Dish">
                            <div class="ig-overlay-bottom" style="height: 50%;"></div>
                            <div class="absolute inset-0 flex flex-col justify-end p-6 z-10 text-left">
                                <p class="text-[12px] font-medium tracking-widest text-white uppercase font-yanone mb-1 opacity-80">Prato Principal</p>
                                <h3 class="text-3xl font-black text-white uppercase font-coolvetica mb-3" style="line-height: 0.85;">Picanha Premium<br><span class="text-orange-500">Na Brasa</span></h3>
                                <div class="flex items-center gap-3">
                                    <p class="text-xs text-zinc-300 font-yanone tracking-wider">A partir de R$ 98</p>
                                    <div class="h-[1px] bg-white/20 flex-1"></div>
                                    <div class="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center shadow-lg"><svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- FEED 2: Lifestyle Quote (4:5) -->
                    <div class="flex flex-col items-center gap-4">
                        <p class="text-xs uppercase tracking-widest text-zinc-500 font-bold">5. Feed: Lifestyle (4:5)</p>
                        <div class="ig-asset w-full max-w-[320px] aspect-[4/5] relative group border-4">
                            <img src="assets/media__1773025426539.jpg" class="ig-img" alt="Environment">
                            <div class="absolute inset-0 bg-black/40 z-10 backdrop-blur-[2px]"></div>
                            <div class="absolute inset-0 flex flex-col justify-center items-center p-8 z-20 text-center">
                                <svg class="w-8 h-8 text-orange-500 mb-4 opacity-80" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 18L14.017 10.609C14.017 4.905 17.748 1.039 23 0L23.995 2.151C21.563 3.068 20 5.789 20 8H24V18H14.017ZM0 18V10.609C0 4.905 3.748 1.038 9 0L9.996 2.151C7.563 3.068 6 5.789 6 8H9.983L9.983 18L0 18Z" /></svg>
                                <h3 class="text-2xl font-bold text-white uppercase font-coolvetica mb-6 leading-tight">Uma boa mesa nunca<br>é feita apenas de comida.<br>É feita de momentos.</h3>
                                <p class="text-[12px] font-medium tracking-widest text-zinc-400 uppercase font-yanone">Experiência Gastronômica</p>
                            </div>
                        </div>
                    </div>

                    <!-- FEED 3: Clean Image with subtle tag (1:1) -->
                    <div class="flex flex-col items-center gap-4">
                        <p class="text-xs uppercase tracking-widest text-zinc-500 font-bold">6. Feed: Clean Tag (1:1)</p>
                        <div class="ig-asset w-full max-w-[320px] aspect-square relative group">
                            <img src="assets/media__1773025405752.jpg" class="ig-img" alt="Dessert">
                            <!-- Overlay just enough for the tag -->
                            <div class="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
                            <div class="absolute inset-0 flex flex-col justify-end p-5 z-20">
                                <div class="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 flex items-center justify-between">
                                    <div class="flex flex-col">
                                        <p class="text-[10px] text-orange-500 uppercase tracking-widest font-bold mb-0.5">Sobremesa</p>
                                        <p class="text-sm font-bold text-white uppercase font-coolvetica tracking-wide">Petit Gâteau</p>
                                    </div>
                                    <div class="h-8 w-8 rounded-full bg-white flex items-center justify-center text-black">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
</section>"""

prefix = content[:match.start(1)]
suffix = content[match.end(1):]

new_content = prefix + social_content + suffix

with open("design-system-v3.html", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Generated design-system-v3.html")
