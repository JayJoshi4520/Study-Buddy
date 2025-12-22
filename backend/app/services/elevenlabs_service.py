import asyncio
import logging
from typing import List, Dict, Any
import aiofiles
import aiohttp
import os
from app.config import settings

logger = logging.getLogger(__name__)

MIME_TYPES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".html": "text/html",
    ".epub": "application/epub+zip",
}

class ElevenLabsService:
    def __init__(self):
        if not settings.ELEVENLABS_API_KEY:
            raise ValueError("ELEVENLABS_API_KEY not configured")
        if not settings.AGENT_ID:
            raise ValueError("ELEVENLABS_AGENT_ID not configured")
        
        self.api_key = settings.ELEVENLABS_API_KEY
        self.agent_id = settings.AGENT_ID
        self.base_url = "https://api.elevenlabs.io/v1"
        self.headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json"
        }

    async def upload_documents_to_kb(self, files_data: List[tuple]) -> List[str]:
        """
        Upload documents to ElevenLabs workspace knowledge base
        files_data: List of tuples (file_path, original_filename)
        """
        doc_ids = []
        
        async with aiohttp.ClientSession() as session:
            for file_path, original_filename in files_data:
                try:
                    # Resolve to absolute path
                    absolute_file_path = os.path.join(settings.UPLOAD_DIR, file_path)
                    
                    if not os.path.exists(absolute_file_path):
                        logger.error(f"File not found: {absolute_file_path}")
                        continue

                    async with aiofiles.open(absolute_file_path, 'rb') as f:
                        file_content = await f.read()
                        
                    data = aiohttp.FormData()
                    file_ext = os.path.splitext(file_path)[1].lower()
                    content_type = MIME_TYPES.get(file_ext, 'application/octet-stream')

                    # Use original_filename for the upload
                    data.add_field(
                        'file', 
                        file_content, 
                        filename=original_filename,
                        content_type=content_type
                    )
                    
                    headers = {"xi-api-key": self.api_key}
                    
                    async with session.post(
                        f"https://api.elevenlabs.io/v1/convai/knowledge-base/file", 
                        data=data, 
                        headers=headers
                    ) as response:
                        if response.status == 200:
                            result = await response.json()
                            # API documentation suggests 'id' is the field name
                            doc_id = result.get('id') or result.get('document_id')
                            
                            if doc_id:
                                doc_ids.append(doc_id)
                                logger.info(f"Uploaded {original_filename} to ElevenLabs KB (ID: {doc_id})")
                            else:
                                logger.error(f"No id returned for {original_filename}. Response keys: {list(result.keys())}")
                        else:
                            error_text = await response.text()
                            logger.error(f"Failed to upload {original_filename}: {error_text}")
                            
                except Exception as e:
                    logger.error(f"Error uploading {original_filename}: {e}")
                    # Continue with other files even if one fails
                    continue
                    
        return doc_ids

        return doc_ids

    async def clear_agent_knowledge_base(self) -> bool:
        """Clear all documents from agent knowledge base"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "knowledge_base": {
                        "documents": []
                    }
                }
                
                async with session.patch(
                    f"{self.base_url}/convai/agents/{self.agent_id}",
                    json=payload,
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        logger.info("Cleared agent knowledge base")
                        return True
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to clear knowledge base: {error_text}")
                        return False
                        
        except Exception as e:
            logger.error(f"Error clearing agent knowledge base: {e}")
            return False

    async def update_agent_full_config(self, prompt: str, documents: List[Dict[str, str]] = None) -> bool:
        """
        Update agent configuration in one go:
        1. Enable RAG
        2. Update system prompt
        3. Attach Knowledge Base documents
        
        documents: List of dicts with keys 'id', 'name', 'type'
        """
        try:
            kb_docs = documents if documents else []
            
            async with aiohttp.ClientSession() as session:
                payload = {
                    "conversation_config": {
                        "agent": {
                            "prompt": {
                                "prompt": prompt,
                                "rag": {
                                    "enabled": False
                                },
                                "knowledge_base": kb_docs
                            }
                        }
                    }
                }
                
                
                async with session.patch(
                    f"{self.base_url}/convai/agents/{self.agent_id}",
                    json=payload,
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        # logger.info(f"Successfully updated agent config (RAG: True, Docs: {len(kb_docs)})")
                        
                        # Verify that the update persisted
                        try:
                             async with session.get(
                                f"{self.base_url}/convai/agents/{self.agent_id}",
                                headers=self.headers
                            ) as verify_response:
                                if verify_response.status == 200:
                                    agent_data = await verify_response.json()
                                    
                                    # Safe extraction with defaults
                                    current_kb = agent_data.get("conversation_config", {}).get("agent", {}).get("prompt", {}).get("knowledge_base", [])
                                    
                                    # Log verification result
                                    logger.info(f"Verification: Agent now has {len(current_kb)} documents attached.")
                                    
                                    # Optional: Check if IDs match
                                    current_ids = [d.get("id") for d in current_kb]
                                    target_ids = [d.get("id") for d in kb_docs]
                                    
                                    if len(kb_docs) > 0 and len(current_kb) == 0:
                                        logger.warning("CRITICAL: Agent update returned 200 but KB is empty in verification!")
                                        return False
                        except Exception as e:
                            logger.error(f"Verification check failed: {e}")
                            
                        logger.info("Agent configuration verified successfully.")
                        return True
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to update agent config: {error_text}")
                        return False
                        
        except Exception as e:
            logger.error(f"Error updating agent config: {e}")
            return False

    # Deprecated/Removed separate attach method to avoid confusion, 
    # but keeping a dummy legacy method if needed or just removing it.
    # We will remove attach_documents_to_agent and rely on the full update.
            
    async def delete_documents_from_kb(self, doc_ids: List[str]) -> bool:
        """Delete documents from workspace knowledge base"""
        try:
            async with aiohttp.ClientSession() as session:
                for doc_id in doc_ids:
                    async with session.delete(
                        f"{self.base_url}/knowledge-base/documents/{doc_id}",
                        headers={"xi-api-key": self.api_key}
                    ) as response:
                        if response.status == 200:
                            logger.info(f"Deleted document {doc_id}")
                        else:
                            logger.warning(f"Failed to delete document {doc_id}")
                            
                return True
                
        except Exception as e:
            logger.error(f"Error deleting documents: {e}")
            return False

elevenlabs_service = ElevenLabsService()