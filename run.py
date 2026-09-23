#!/usr/bin/env python3
"""
GTM Audit - Script de Inicialização
====================================
Inicia o servidor completo com todas as dependências.

Uso:
    python run.py          # Modo normal
    python run.py --dev    # Modo desenvolvimento (com reload)
    python run.py --build  # Rebuild do frontend antes de iniciar
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path

# Cores para terminal
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_header():
    print(f"""
{Colors.CYAN}{Colors.BOLD}
=============================================================
                     DataTrust Audit v2.0                        
         Auditoria de Tag Manager + LGPD Compliance        
=============================================================
{Colors.ENDC}""")

def check_python_version():
    """Verifica versão do Python"""
    if sys.version_info < (3, 8):
        print(f"{Colors.FAIL}[ERR] Python 3.8+ é necessário. Versão atual: {sys.version}{Colors.ENDC}")
        sys.exit(1)
    print(f"{Colors.GREEN}[OK] Python {sys.version.split()[0]}{Colors.ENDC}")

def check_env_file():
    """Verifica se .env existe e tem API key"""
    env_path = Path(__file__).parent / ".env"
    env_example = Path(__file__).parent / ".env.example"
    
    if not env_path.exists():
        if env_example.exists():
            # Copia o exemplo
            import shutil
            shutil.copy(env_example, env_path)
            print(f"{Colors.WARNING}[WARN] Arquivo .env criado a partir do exemplo{Colors.ENDC}")
        else:
            print(f"{Colors.WARNING}[WARN] Arquivo .env não encontrado{Colors.ENDC}")
            return False
    
    # Verifica se tem API key
    with open(env_path, 'r', encoding='utf-8') as f:
        content = f.read()
        if 'GOOGLE_API_KEY=' in content:
            lines = content.split('\n')
            for line in lines:
                if line.startswith('GOOGLE_API_KEY=') and len(line.split('=')[1].strip()) > 10:
                    print(f"{Colors.GREEN}[OK] Gemini API Key configurada{Colors.ENDC}")
                    return True
    
    print(f"{Colors.WARNING}[WARN] Gemini API Key não configurada (chat usará modo regras){Colors.ENDC}")
    print(f"   Para configurar: edite .env e adicione GOOGLE_API_KEY=sua_chave")
    print(f"   Obtenha em: https://aistudio.google.com/app/apikey")
    return True

def install_dependencies():
    """Instala dependências Python"""
    print(f"\n{Colors.BLUE}[DEPS] Verificando dependências Python...{Colors.ENDC}")
    
    req_file = Path(__file__).parent / "req.txt"
    if req_file.exists():
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(req_file), "-q"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(f"{Colors.GREEN}[OK] Dependências Python instaladas{Colors.ENDC}")
        else:
            print(f"{Colors.FAIL}[ERR] Erro ao instalar dependências: {result.stderr}{Colors.ENDC}")
            return False
    return True

def check_frontend_build():
    """Verifica se o frontend foi buildado"""
    dist_path = Path(__file__).parent / "static" / "dist"
    index_path = dist_path / "index.html"
    
    if index_path.exists():
        print(f"{Colors.GREEN}[OK] Frontend build encontrado{Colors.ENDC}")
        return True
    else:
        print(f"{Colors.WARNING}[WARN] Frontend não buildado{Colors.ENDC}")
        return False

def build_frontend():
    """Builda o frontend React"""
    print(f"\n{Colors.BLUE}[BUILD] Buildando frontend...{Colors.ENDC}")
    
    static_path = Path(__file__).parent / "static"
    
    # Verifica se node_modules existe
    node_modules = static_path / "node_modules"
    if not node_modules.exists():
        print(f"   Instalando dependências npm...")
        result = subprocess.run(
            ["npm", "install"],
            cwd=str(static_path),
            capture_output=True,
            text=True,
            shell=True
        )
        if result.returncode != 0:
            print(f"{Colors.FAIL}[ERR] Erro no npm install: {result.stderr}{Colors.ENDC}")
            return False
    
    # Build
    print(f"   Executando build...")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(static_path),
        capture_output=True,
        text=True,
        shell=True
    )
    
    if result.returncode == 0:
        print(f"{Colors.GREEN}[OK] Frontend buildado com sucesso{Colors.ENDC}")
        return True
    else:
        print(f"{Colors.FAIL}[ERR] Erro no build: {result.stderr}{Colors.ENDC}")
        return False

def start_server(dev_mode=False):
    """Inicia o servidor FastAPI"""
    print(f"\n{Colors.CYAN}{'='*60}{Colors.ENDC}")
    print(f"{Colors.GREEN}{Colors.BOLD}[START] Iniciando servidor GTM Audit...{Colors.ENDC}")
    print(f"{Colors.CYAN}{'='*60}{Colors.ENDC}")
    print(f"\n   {Colors.BOLD}URL: http://localhost:8000{Colors.ENDC}")
    print(f"   {Colors.BOLD}API Docs: http://localhost:8000/docs{Colors.ENDC}")
    print(f"\n   Pressione Ctrl+C para parar\n")
    
    cmd = [
        sys.executable, "-m", "uvicorn",
        "main:app",
        "--host", "0.0.0.0",
        "--port", "8000"
    ]
    
    if dev_mode:
        cmd.append("--reload")
        print(f"{Colors.CYAN}   Modo desenvolvimento (auto-reload ativo){Colors.ENDC}\n")
    
    try:
        subprocess.run(cmd, cwd=str(Path(__file__).parent))
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}[BYE] Servidor encerrado{Colors.ENDC}")

def main():
    parser = argparse.ArgumentParser(description='GTM Audit - Inicialização')
    parser.add_argument('--dev', action='store_true', help='Modo desenvolvimento com auto-reload')
    parser.add_argument('--build', action='store_true', help='Força rebuild do frontend')
    parser.add_argument('--skip-deps', action='store_true', help='Pula instalação de dependências')
    args = parser.parse_args()
    
    print_header()
    
    # Verificações
    print(f"{Colors.BLUE}[CHECK] Verificando ambiente...{Colors.ENDC}\n")
    
    check_python_version()
    check_env_file()
    
    if not args.skip_deps:
        install_dependencies()
    
    # Frontend
    if args.build or not check_frontend_build():
        build_frontend()
    
    # Inicia servidor
    start_server(dev_mode=args.dev)

if __name__ == "__main__":
    main()
