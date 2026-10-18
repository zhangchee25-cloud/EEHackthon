import argparse
import json
import logging
import sys
from .config import Config
from .errors import AppError
from .model import ModelClient
from .server import create_server


def main():
    parser = argparse.ArgumentParser(description="课程学习 Agent 本机后端")
    parser.add_argument("--list-models", action="store_true", help="只查询配置平台的可用模型名称")
    parser.add_argument("--check-config", action="store_true", help="检查配置完整性，不发模型请求")
    args = parser.parse_args()
    try:
        config = Config.from_env()
        if args.list_models:
            print(json.dumps({"models": ModelClient(config).list_models()}, ensure_ascii=False, indent=2))
            return 0
        if args.check_config:
            missing = [k for k, v in (("MODEL_BASE_URL", config.base_url), ("MODEL_API_KEY", config.api_key), ("MODEL_NAME", config.model)) if not v]
            print(json.dumps({"configured": not missing, "missingSettings": missing, "model": config.model or None}, ensure_ascii=False))
            return 1 if missing else 0
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
        server = create_server(config)
        print(f"学习 Agent 后端：http://{config.host}:{server.server_port}（本机单用户演示）", flush=True)
        print("模型状态：" + ("已配置" if ModelClient(config).configured() else "配置未完整，上传/保存可用，问答返回明确配置错误"), flush=True)
        try:
            server.serve_forever(poll_interval=0.2)
        except KeyboardInterrupt:
            print("服务已停止。学习记录保留在本机数据目录。")
        finally:
            server.server_close()
        return 0
    except AppError as exc:
        print(json.dumps(exc.payload(), ensure_ascii=False), file=sys.stderr)
        return 1
    except (OSError, ValueError):
        print("启动失败：请检查端口是否被占用、本机配置格式、数据目录权限和依赖。", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

