import chatgptLogo from "@/assets/tool-logos/chatgpt.png";
import claudeLogo from "@/assets/tool-logos/claude.png";
import geminiLogo from "@/assets/tool-logos/gemini.png";
import copilotLogo from "@/assets/tool-logos/copilot.png";
import perplexityLogo from "@/assets/tool-logos/perplexity.png";
import lovableLogo from "@/assets/tool-logos/lovable.jpeg";
import figmaLogo from "@/assets/tool-logos/figma.png";
import grokLogo from "@/assets/tool-logos/grok.png";
import deepseekLogo from "@/assets/tool-logos/deepseek.png";
import mistralLogo from "@/assets/tool-logos/mistral.png";
import huggingfaceLogo from "@/assets/tool-logos/huggingface.png";
import boltLogo from "@/assets/tool-logos/bolt.webp";

export const TOOL_LOGO_IMAGES: Record<string, string> = {
  chatgpt: chatgptLogo,
  "chat.openai": chatgptLogo,
  openai: chatgptLogo,
  claude: claudeLogo,
  anthropic: claudeLogo,
  gemini: geminiLogo,
  google: geminiLogo,
  copilot: copilotLogo,
  perplexity: perplexityLogo,
  lovable: lovableLogo,
  figma: figmaLogo,
  grok: grokLogo,
  deepseek: deepseekLogo,
  mistral: mistralLogo,
  huggingface: huggingfaceLogo,
  hugging_face: huggingfaceLogo,
  bolt: boltLogo,
  "bolt.new": boltLogo,
};

export const TOOL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  copilot: "Copilot",
  perplexity: "Perplexity",
  lovable: "Lovable",
  figma: "Figma",
  grok: "Grok",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  huggingface: "Hugging Face",
  bolt: "Bolt",
};

export function toolLabel(tool: string): string {
  const k = tool.toLowerCase();
  return TOOL_LABELS[k] ?? tool;
}
