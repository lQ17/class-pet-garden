<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Product, RedemptionRecord } from '@/types'
import { useClasses } from '@/composables/useClasses'
import { useStudents } from '@/composables/useStudents'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuth } from '@/composables/useAuth'
import PageLayout from '@/components/layout/PageLayout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { api } = useAuth()
const { classes, currentClass } = useClasses()
const { students, loadStudents } = useStudents()
const toast = useToast()
const { confirmDialog, showConfirm, closeConfirm } = useConfirm()

const products = ref<Product[]>([])
const redemptions = ref<RedemptionRecord[]>([])
const isLoading = ref(false)
const uploadingImage = ref(false)
const activeTab = ref<'products' | 'redemptions'>('products')

const showProductModal = ref(false)
const showImageViewer = ref(false)
const viewingImageUrl = ref('')
const editingProduct = ref<Product | null>(null)
const productForm = ref({
  name: '',
  description: '',
  price: 0,
  stock: -1,
  imageUrl: '',
  isEnabled: true,
  sortOrder: 0
})

const showRedeemModal = ref(false)
const redeemingProduct = ref<Product | null>(null)
const selectedStudentId = ref('')

async function loadProducts() {
  try {
    const res = await api.get('/shop/products')
    products.value = res.data.products
  } catch (error) {
    console.error('加载商品失败:', error)
  }
}

async function loadRedemptions() {
  try {
    const res = await api.get('/shop/redemptions')
    redemptions.value = res.data.records
  } catch (error) {
    console.error('加载兑换记录失败:', error)
  }
}

function openAddProductModal() {
  editingProduct.value = null
  productForm.value = {
    name: '',
    description: '',
    price: 0,
    stock: -1,
    imageUrl: '',
    isEnabled: true,
    sortOrder: 0
  }
  showProductModal.value = true
}

function openEditProductModal(product: Product) {
  editingProduct.value = product
  productForm.value = {
    name: product.name,
    description: product.description || '',
    price: product.price,
    stock: product.stock,
    imageUrl: product.image_url || '',
    isEnabled: Boolean(product.is_enabled),
    sortOrder: product.sort_order
  }
  showProductModal.value = true
}

async function saveProduct() {
  if (!productForm.value.name.trim()) {
    toast.warning('请输入商品名称')
    return
  }
  if (productForm.value.price <= 0) {
    toast.warning('价格必须大于0')
    return
  }

  try {
    if (editingProduct.value) {
      await api.put(`/shop/products/${editingProduct.value.id}`, productForm.value)
      toast.success('更新成功')
    } else {
      await api.post('/shop/products', productForm.value)
      toast.success('添加成功')
    }
    showProductModal.value = false
    await loadProducts()
  } catch (error: any) {
    toast.error(error.response?.data?.error || '保存失败')
  }
}

async function handleImageUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  uploadingImage.value = true
  try {
    const formData = new FormData()
    formData.append('image', file)

    const res = await api.post('/shop/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    productForm.value.imageUrl = res.data.imageUrl
    toast.success('图片上传成功')
  } catch (error: any) {
    toast.error(error.response?.data?.error || '图片上传失败')
  } finally {
    uploadingImage.value = false
  }
}

function clearImage() {
  productForm.value.imageUrl = ''
}

function openImageViewer(imageUrl: string) {
  viewingImageUrl.value = imageUrl
  showImageViewer.value = true
}

async function deleteProduct(productId: string) {
  showConfirm({
    title: '删除商品',
    message: '确定删除该商品？',
    confirmText: '删除',
    type: 'danger',
    onConfirm: async () => {
      try {
        await api.delete(`/shop/products/${productId}`)
        toast.success('删除成功')
        await loadProducts()
      } catch (error: any) {
        toast.error(error.response?.data?.error || '删除失败')
      }
    }
  })
}

function openRedeemModal(product: Product) {
  redeemingProduct.value = product
  selectedStudentId.value = ''
  showRedeemModal.value = true
}

async function redeemProduct() {
  if (!selectedStudentId.value) {
    toast.warning('请选择学生')
    return
  }
  if (!redeemingProduct.value) return

  showConfirm({
    title: '确认兑换',
    message: `确定用 ${redeemingProduct.value.price} 积分兑换「${redeemingProduct.value.name}」吗？`,
    confirmText: '确认兑换',
    type: 'warning',
    onConfirm: async () => {
      try {
        await api.post('/shop/redeem', {
          studentId: selectedStudentId.value,
          productId: redeemingProduct.value!.id
        })
        toast.success('兑换成功！')
        showRedeemModal.value = false
        await loadProducts()
        await loadRedemptions()
        if (currentClass.value) {
          await loadStudents()
        }
      } catch (error: any) {
        toast.error(error.response?.data?.error || '兑换失败')
      }
    }
  })
}

const enabledProducts = computed(() => products.value.filter(p => p.is_enabled))
const disabledProducts = computed(() => products.value.filter(p => !p.is_enabled))

onMounted(async () => {
  isLoading.value = true
  await Promise.all([loadProducts(), loadRedemptions()])
  if (currentClass.value) {
    await loadStudents()
  }
  isLoading.value = false
})
</script>

<template>
  <PageLayout>
    <div class="max-w-5xl mx-auto">
      <!-- 无班级状态 -->
      <div v-if="classes.length === 0" class="flex flex-col items-center justify-center min-h-[60vh]">
        <div class="text-8xl mb-6 animate-float">🛒</div>
        <h3 class="text-2xl font-bold text-gray-700 mb-3">还没有班级</h3>
        <p class="text-gray-500 mb-6 text-lg">请先创建一个班级，再使用商城</p>
      </div>

      <!-- 有班级的正常界面 -->
      <template v-else>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <span class="text-3xl">🛒</span> 积分商城
            </h1>
            <p class="text-gray-500 text-sm mt-1">用可使用积分兑换礼品</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="openAddProductModal"
              class="px-4 py-2 text-sm text-white bg-gradient-to-r from-orange-400 to-pink-500 rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
            >
              ➕ 添加商品
            </button>
          </div>
        </div>

        <!-- Tab 切换 -->
        <div class="flex gap-2 mb-6">
          <button
            @click="activeTab = 'products'"
            class="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            :class="activeTab === 'products' 
              ? 'bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow-md' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          >
            📦 商品列表
          </button>
          <button
            @click="activeTab = 'redemptions'"
            class="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            :class="activeTab === 'redemptions' 
              ? 'bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow-md' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          >
            📋 兑换记录
          </button>
        </div>

        <!-- 商品列表 -->
        <div v-if="activeTab === 'products'">
          <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="text-center">
              <div class="text-6xl animate-bounce mb-4">🛒</div>
              <div class="text-gray-500">加载中...</div>
            </div>
          </div>
          <template v-else>
            <!-- 上架商品 -->
            <div v-if="enabledProducts.length > 0">
              <h3 class="text-lg font-bold text-gray-700 mb-4">上架中</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <div
                  v-for="product in enabledProducts"
                  :key="product.id"
                  class="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-md transition-all"
                >
                  <div class="h-48 bg-gradient-to-br from-orange-100 to-pink-100 flex items-center justify-center overflow-hidden cursor-pointer" @click="product.image_url && openImageViewer(product.image_url)">
                    <img
                      v-if="product.image_url"
                      :src="product.image_url"
                      :alt="product.name"
                      class="w-full h-full object-contain"
                    />
                    <span v-else class="text-5xl">🎁</span>
                  </div>
                  <div class="p-4">
                    <div class="flex items-start justify-between mb-2">
                      <h4 class="font-bold text-gray-800">{{ product.name }}</h4>
                      <div class="flex gap-1">
                        <button
                          @click="openEditProductModal(product)"
                          class="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          @click="deleteProduct(product.id)"
                          class="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <p v-if="product.description" class="text-sm text-gray-500 mb-3">{{ product.description }}</p>
                    <div class="flex items-center justify-between">
                      <div class="text-orange-500 font-bold">{{ product.price }} 积分</div>
                      <div class="text-sm text-gray-500">
                        {{ product.stock === -1 ? '无限库存' : `剩余 ${product.stock}` }}
                      </div>
                    </div>
                    <button
                      @click="openRedeemModal(product)"
                      :disabled="(product.stock !== -1 && product.stock <= 0)"
                      class="w-full mt-3 py-2 rounded-xl text-sm font-medium transition-all"
                      :class="(product.stock !== -1 && product.stock <= 0)
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-orange-400 to-pink-500 text-white hover:shadow-md'"
                    >
                      兑换
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 下架商品 -->
            <div v-if="disabledProducts.length > 0">
              <h3 class="text-lg font-bold text-gray-700 mb-4">已下架</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div
                  v-for="product in disabledProducts"
                  :key="product.id"
                  class="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 opacity-60"
                >
                  <div class="h-48 bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer" @click="product.image_url && openImageViewer(product.image_url)">
                    <img
                      v-if="product.image_url"
                      :src="product.image_url"
                      :alt="product.name"
                      class="w-full h-full object-contain"
                    />
                    <span v-else class="text-5xl">🎁</span>
                  </div>
                  <div class="p-4">
                    <div class="flex items-start justify-between mb-2">
                      <h4 class="font-bold text-gray-800">{{ product.name }}</h4>
                      <div class="flex gap-1">
                        <button
                          @click="openEditProductModal(product)"
                          class="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          @click="deleteProduct(product.id)"
                          class="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <p v-if="product.description" class="text-sm text-gray-500 mb-3">{{ product.description }}</p>
                    <div class="text-gray-400 text-sm">已下架</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="products.length === 0" class="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm">
              <div class="text-6xl mb-4">📦</div>
              <div>暂无商品</div>
              <button
                @click="openAddProductModal"
                class="mt-4 text-orange-500 hover:text-orange-600 font-medium"
              >
                添加第一个商品
              </button>
            </div>
          </template>
        </div>

        <!-- 兑换记录 -->
        <div v-if="activeTab === 'redemptions'">
          <div v-if="redemptions.length === 0" class="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm">
            <div class="text-6xl mb-4">📋</div>
            <div>暂无兑换记录</div>
          </div>
          <div v-else class="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div class="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-500">
              <div class="col-span-3">学生</div>
              <div class="col-span-3">商品</div>
              <div class="col-span-2">积分</div>
              <div class="col-span-4">兑换时间</div>
            </div>
            <div
              v-for="record in redemptions"
              :key="record.id"
              class="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors items-center"
            >
              <div class="col-span-3 font-medium text-gray-800">{{ record.student_name }}</div>
              <div class="col-span-3 text-gray-700">{{ record.product_name }}</div>
              <div class="col-span-2 text-orange-500 font-medium">{{ record.price }}</div>
              <div class="col-span-4 text-sm text-gray-500">
                {{ new Date(record.redeemed_at).toLocaleString() }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 商品编辑弹窗 -->
      <Transition name="modal">
        <div
          v-if="showProductModal"
          class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          @click.self="showProductModal = false"
        >
          <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 class="text-lg font-bold mb-4">
              {{ editingProduct ? '✏️ 编辑商品' : '➕ 添加商品' }}
            </h3>
            <div class="space-y-4">
              <div>
                <label class="block text-sm text-gray-500 mb-1">商品图片</label>
                <div class="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                  <div v-if="productForm.imageUrl" class="relative">
                    <img :src="productForm.imageUrl" alt="商品图片" class="h-32 mx-auto rounded-lg object-cover" />
                    <button 
                      @click="clearImage"
                      type="button"
                      class="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full text-sm hover:bg-red-600"
                    >✕</button>
                  </div>
                  <div v-else class="py-8">
                    <input
                      type="file"
                      accept="image/*"
                      @change="handleImageUpload"
                      class="hidden"
                      id="productImage"
                      :disabled="uploadingImage"
                    />
                    <label for="productImage" class="cursor-pointer">
                      <div class="text-4xl mb-2">📷</div>
                      <p class="text-sm text-gray-500">
                        {{ uploadingImage ? '上传中...' : '点击或拖拽上传图片' }}
                      </p>
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-500 mb-1">商品名称 *</label>
                <input
                  v-model="productForm.name"
                  type="text"
                  placeholder="请输入商品名称"
                  class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label class="block text-sm text-gray-500 mb-1">描述</label>
                <textarea
                  v-model="productForm.description"
                  rows="3"
                  placeholder="商品描述（可选）"
                  class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                ></textarea>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-gray-500 mb-1">所需积分 *</label>
                  <input
                    v-model.number="productForm.price"
                    type="number"
                    min="1"
                    placeholder="0"
                    class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label class="block text-sm text-gray-500 mb-1">库存</label>
                  <input
                    v-model.number="productForm.stock"
                    type="number"
                    min="-1"
                    placeholder="-1=无限"
                    class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  />
                  <p class="text-xs text-gray-400 mt-1">输入 -1 表示无限库存</p>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-500 mb-1">排序</label>
                <input
                  v-model.number="productForm.sortOrder"
                  type="number"
                  placeholder="0"
                  class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model="productForm.isEnabled"
                  type="checkbox"
                  id="productEnabled"
                  class="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                />
                <label for="productEnabled" class="text-sm text-gray-600">上架销售</label>
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-6">
              <button
                @click="showProductModal = false"
                class="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button
                @click="saveProduct"
                class="px-4 py-2 bg-gradient-to-r from-orange-400 to-pink-500 text-white rounded-xl text-sm font-medium shadow-sm"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 兑换弹窗 -->
      <Transition name="modal">
        <div
          v-if="showRedeemModal"
          class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          @click.self="showRedeemModal = false"
        >
          <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 class="text-lg font-bold mb-1">🎁 兑换商品</h3>
            <p class="text-sm text-gray-500 mb-4">「{{ redeemingProduct?.name }}」- {{ redeemingProduct?.price }} 积分</p>
            
            <div class="mb-4 p-4 bg-orange-50 rounded-xl">
              <p class="text-sm text-gray-600 mb-2">请选择要兑换的学生：</p>
              <select
                v-model="selectedStudentId"
                class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
              >
                <option value="">请选择学生</option>
                <option
                  v-for="student in students"
                  :key="student.id"
                  :value="student.id"
                >
                  {{ student.name }} (可用: {{ student.usable_points || 0 }} 积分)
                </option>
              </select>
              <div v-if="selectedStudentId" class="mt-2 text-sm">
                <span class="text-gray-500">可用积分：</span>
                <span class="font-bold text-orange-500">
                  {{ students.find(s => s.id === selectedStudentId)?.usable_points || 0 }}
                </span>
              </div>
            </div>

            <div class="flex justify-end gap-2">
              <button
                @click="showRedeemModal = false"
                class="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button
                @click="redeemProduct"
                class="px-4 py-2 bg-gradient-to-r from-orange-400 to-pink-500 text-white rounded-xl text-sm font-medium shadow-sm"
              >
                确认兑换
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <ConfirmDialog
        :show="confirmDialog.show"
        :title="confirmDialog.title"
        :message="confirmDialog.message"
        :confirm-text="confirmDialog.confirmText"
        :cancel-text="confirmDialog.cancelText"
        :type="confirmDialog.type"
        @confirm="confirmDialog.onConfirm"
        @cancel="closeConfirm"
      />

      <!-- 图片查看器 -->
      <Transition name="modal">
        <div
          v-if="showImageViewer"
          class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          @click="showImageViewer = false"
        >
          <div class="max-w-full max-h-full relative">
            <img
              :src="viewingImageUrl"
              alt="查看图片"
              class="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
              @click.stop
            />
            <button
              @click="showImageViewer = false"
              class="absolute top-4 right-4 w-10 h-10 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors flex items-center justify-center text-xl"
            >✕</button>
          </div>
        </div>
      </Transition>
    </div>
  </PageLayout>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.95);
}
</style>
