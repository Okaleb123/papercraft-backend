import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Diretório para armazenar dados
const DATA_DIR = path.join(__dirname, 'data');
const GALLERY_FILE = path.join(DATA_DIR, 'gallery.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

// Criar diretório de dados se não existir
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inicializar arquivo de galeria se não existir
if (!fs.existsSync(GALLERY_FILE)) {
  const initialData = [];
  fs.writeFileSync(GALLERY_FILE, JSON.stringify(initialData, null, 2));
}

// Inicializar arquivo de produtos se não existir
if (!fs.existsSync(PRODUCTS_FILE)) {
  const initialData = [];
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(initialData, null, 2));
}

// Funções auxiliares
const readGallery = () => {
  const data = fs.readFileSync(GALLERY_FILE, 'utf8');
  return JSON.parse(data);
};

const writeGallery = (data) => {
  fs.writeFileSync(GALLERY_FILE, JSON.stringify(data, null, 2));
};

const readProducts = () => {
  const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
  return JSON.parse(data);
};

const writeProducts = (data) => {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));
};

// ===== ROTAS DA API =====

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend funcionando!' });
});

// GET - Buscar todos os itens da galeria
app.get('/api/gallery', (req, res) => {
  try {
    const userId = req.query.userId;
    const items = readGallery();
    
    // Adicionar flag likedByMe para cada item e garantir que comments existe
    const itemsWithLikedFlag = items.map(item => ({
      ...item,
      comments: item.comments || [],
      likedByMe: item.likedBy ? item.likedBy.includes(userId) : false,
      likedBy: undefined // Remover do response
    }));
    
    res.json(itemsWithLikedFlag);
  } catch (error) {
    console.error('Erro ao buscar galeria:', error);
    res.status(500).json({ error: 'Erro ao buscar galeria' });
  }
});

// POST - Criar nova postagem
app.post('/api/gallery', (req, res) => {
  try {
    const { title, imageUrl, authorName, authorId, authorAvatar } = req.body;
    
    if (!title || !imageUrl || !authorName || !authorId) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    
    const items = readGallery();
    const newItem = {
      id: Date.now(),
      title,
      imageUrl,
      authorName,
      authorId,
      authorAvatar,
      likes: 0,
      likedBy: [],
      comments: [],
      createdAt: new Date().toISOString()
    };
    
    items.unshift(newItem); // Adicionar no início
    writeGallery(items);
    
    // Retornar com likedByMe
    res.status(201).json({
      ...newItem,
      likedByMe: false,
      likedBy: undefined
    });
  } catch (error) {
    console.error('Erro ao criar postagem:', error);
    res.status(500).json({ error: 'Erro ao criar postagem' });
  }
});

// POST - Dar like/unlike em um item
app.post('/api/gallery/:id/like', (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }
    
    const items = readGallery();
    const itemIndex = items.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    
    const item = items[itemIndex];
    if (!item.likedBy) {
      item.likedBy = [];
    }
    
    const userLikedIndex = item.likedBy.indexOf(userId);
    
    if (userLikedIndex > -1) {
      // Remove like
      item.likedBy.splice(userLikedIndex, 1);
      item.likes = Math.max(0, item.likes - 1);
    } else {
      // Adiciona like
      item.likedBy.push(userId);
      item.likes += 1;
    }
    
    items[itemIndex] = item;
    writeGallery(items);
    
    res.json({
      ...item,
      likedByMe: item.likedBy.includes(userId),
      likedBy: undefined
    });
  } catch (error) {
    console.error('Erro ao dar like:', error);
    res.status(500).json({ error: 'Erro ao processar like' });
  }
});

// DELETE - Apagar postagem
app.delete('/api/gallery/:id', (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { userId, isAdmin } = req.body;
    
    console.log('🗑️ Tentando deletar postagem:', { itemId, userId, isAdmin });
    
    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }
    
    const items = readGallery();
    const itemIndex = items.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    
    // Verificar se é o autor ou admin
    const isUserAdmin = userId === 'admin_master' || isAdmin === true;
    
    console.log('🔍 Verificando permissões:', { 
      postAuthorId: items[itemIndex].authorId, 
      userId, 
      isUserAdmin,
      canDelete: items[itemIndex].authorId === userId || isUserAdmin 
    });
    
    if (items[itemIndex].authorId !== userId && !isUserAdmin) {
      console.log('❌ Não autorizado');
      return res.status(403).json({ error: 'Não autorizado' });
    }
    
    items.splice(itemIndex, 1);
    writeGallery(items);
    
    console.log('✅ Postagem deletada com sucesso');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erro ao apagar postagem:', error);
    res.status(500).json({ error: 'Erro ao apagar postagem' });
  }
});

// ===== ROTAS DE COMENTÁRIOS =====

// GET - Buscar comentários de um post
app.get('/api/gallery/:id/comments', (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const items = readGallery();
    const item = items.find(i => i.id === itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }
    
    res.json(item.comments || []);
  } catch (error) {
    console.error('Erro ao buscar comentários:', error);
    res.status(500).json({ error: 'Erro ao buscar comentários' });
  }
});

// POST - Adicionar comentário
app.post('/api/gallery/:id/comments', (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { text, authorName, authorId, authorAvatar } = req.body;
    
    console.log('📝 Adicionando comentário:', { itemId, text, authorName, authorId });
    
    if (!text || !authorName || !authorId) {
      console.log('❌ Dados incompletos:', { text, authorName, authorId });
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    
    const items = readGallery();
    const itemIndex = items.findIndex(i => i.id === itemId);
    
    if (itemIndex === -1) {
      console.log('❌ Post não encontrado:', itemId);
      return res.status(404).json({ error: 'Post não encontrado' });
    }
    
    if (!items[itemIndex].comments) {
      items[itemIndex].comments = [];
    }
    
    const newComment = {
      id: Date.now(),
      postId: itemId,
      text,
      authorName,
      authorId,
      authorAvatar,
      createdAt: new Date().toISOString()
    };
    
    items[itemIndex].comments.push(newComment);
    writeGallery(items);
    
    console.log('✅ Comentário adicionado com sucesso:', newComment.id);
    res.status(201).json(newComment);
  } catch (error) {
    console.error('❌ Erro ao criar comentário:', error);
    res.status(500).json({ error: 'Erro ao criar comentário', message: error.message });
  }
});

// DELETE - Deletar comentário
app.delete('/api/gallery/:postId/comments/:commentId', (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const commentId = parseInt(req.params.commentId);
    const { userId, isAdmin } = req.body;
    
    console.log('🗑️ Tentando deletar comentário:', { postId, commentId, userId, isAdmin });
    
    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }
    
    const items = readGallery();
    const itemIndex = items.findIndex(i => i.id === postId);
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }
    
    if (!items[itemIndex].comments) {
      return res.status(404).json({ error: 'Comentário não encontrado' });
    }
    
    const commentIndex = items[itemIndex].comments.findIndex(c => c.id === commentId);
    
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comentário não encontrado' });
    }
    
    // Verificar se é o autor do comentário ou admin
    const comment = items[itemIndex].comments[commentIndex];
    const isUserAdmin = userId === 'admin_master' || isAdmin === true;
    
    console.log('🔍 Verificando permissões:', { 
      commentAuthorId: comment.authorId, 
      userId, 
      isUserAdmin,
      canDelete: comment.authorId === userId || isUserAdmin 
    });
    
    if (comment.authorId !== userId && !isUserAdmin) {
      console.log('❌ Não autorizado');
      return res.status(403).json({ error: 'Não autorizado' });
    }
    
    items[itemIndex].comments.splice(commentIndex, 1);
    writeGallery(items);
    
    console.log('✅ Comentário deletado com sucesso');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erro ao deletar comentário:', error);
    res.status(500).json({ error: 'Erro ao deletar comentário' });
  }
});

// ===== ROTAS DE PRODUTOS =====

// GET - Buscar todos os produtos
app.get('/api/products', (req, res) => {
  try {
    const products = readProducts();
    res.json(products);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// POST - Criar novo produto (ADMIN)
app.post('/api/products', (req, res) => {
  try {
    const { title, description, imageUrl, price, originalPrice, link, features } = req.body;
    
    if (!title || !description || !imageUrl || !price || !link) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    
    const products = readProducts();
    const newProduct = {
      id: Date.now(),
      title,
      description,
      imageUrl,
      price,
      originalPrice: originalPrice || null,
      link,
      features: features || [],
      createdAt: new Date().toISOString()
    };
    
    products.unshift(newProduct);
    writeProducts(products);
    
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// PUT - Atualizar produto (ADMIN)
app.put('/api/products/:id', (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { title, description, imageUrl, price, originalPrice, link, features } = req.body;
    
    const products = readProducts();
    const productIndex = products.findIndex(p => p.id === productId);
    
    if (productIndex === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    products[productIndex] = {
      ...products[productIndex],
      title,
      description,
      imageUrl,
      price,
      originalPrice: originalPrice || null,
      link,
      features: features || []
    };
    
    writeProducts(products);
    res.json(products[productIndex]);
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// DELETE - Deletar produto (ADMIN)
app.delete('/api/products/:id', (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    const products = readProducts();
    const filteredProducts = products.filter(p => p.id !== productId);
    
    if (products.length === filteredProducts.length) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    writeProducts(filteredProducts);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar produto:', error);
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📁 Dados salvos em: ${DATA_DIR}`);
});
