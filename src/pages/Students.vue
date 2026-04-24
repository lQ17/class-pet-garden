<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Student } from '@/types'
import { useClasses } from '@/composables/useClasses'
import { useStudents } from '@/composables/useStudents'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { matchByPinyin } from '@/utils/pinyin'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PageLayout from '@/components/layout/PageLayout.vue'
import ClassModal from '@/components/modals/ClassModal.vue'

const { classes, currentClass, createClass } = useClasses()
const { students, isLoading, loadStudents, addStudent, updateStudent, deleteStudent, importStudents } = useStudents()
const toast = useToast()
const { confirmDialog, showConfirm, closeConfirm } = useConfirm()

const showClassModal = ref(false)
const searchQuery = ref('')
const showAddForm = ref(false)
const newStudentName = ref('')
const newStudentNo = ref('')
const newPassword = ref('')
const showImportForm = ref(false)
const importText = ref('')
const editingStudent = ref<Student | null>(null)
const editName = ref('')
const editPassword = ref('')

const filteredStudents = computed(() => {
  if (!searchQuery.value.trim()) return students.value

  const query = searchQuery.value.toLowerCase().trim()
  return students.value.filter(student => {
    if (student.name.toLowerCase().includes(query)) return true
    if (student.student_no?.toLowerCase().includes(query)) return true
    return matchByPinyin(student.name, query)
  })
})

async function handleCreateClass(name: string) {
  if (!name.trim()) {
    toast.warning('请输入班级名称')
    return
  }

  try {
    await createClass(name.trim())
    toast.success('班级创建成功')
    showClassModal.value = false
  } catch {
    toast.error('创建班级失败')
  }
}

async function handleAddStudent() {
  if (!newStudentName.value.trim() || !newStudentNo.value.trim() || !newPassword.value) {
    toast.warning('姓名、学号、密码均为必填项')
    return
  }

  try {
    await addStudent(newStudentName.value.trim(), newStudentNo.value.trim(), newPassword.value)
    toast.success('学生账号已创建')
    newStudentName.value = ''
    newStudentNo.value = ''
    newPassword.value = ''
    showAddForm.value = false
  } catch (error: any) {
    toast.error(error.response?.data?.error || '添加失败')
  }
}

function startEdit(student: Student) {
  editingStudent.value = student
  editName.value = student.name
  editPassword.value = ''
}

function cancelEdit() {
  editingStudent.value = null
  editName.value = ''
  editPassword.value = ''
}

async function handleSaveEdit() {
  if (!editingStudent.value || !editName.value.trim()) return

  try {
    await updateStudent(editingStudent.value.id, {
      name: editName.value.trim(),
      studentNo: editingStudent.value.student_no,
      password: editPassword.value || null
    })
    toast.success('保存成功')
    cancelEdit()
  } catch (error: any) {
    toast.error(error.response?.data?.error || '保存失败')
  }
}

function handleDeleteStudent(student: Student) {
  showConfirm({
    title: '删除学生',
    message: `确定删除 ${student.name}？对应的学生登录账号也会被删除。`,
    confirmText: '删除',
    type: 'danger',
    onConfirm: async () => {
      try {
        await deleteStudent(student.id)
        toast.success('删除成功')
      } catch (error: any) {
        toast.error(error.response?.data?.error || '删除失败')
      }
    }
  })
}

async function handleImportStudents() {
  const rows = importText.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name = '', studentNo = '', password = ''] = line.split(/[,，\s]+/)
      return { name: name.trim(), studentNo: studentNo.trim(), password: password.trim() }
    })

  if (rows.length === 0 || rows.some(row => !row.name || !row.studentNo || !row.password)) {
    toast.warning('请按“姓名,学号,密码”格式填写，每行一个学生')
    return
  }

  try {
    const res = await importStudents(rows)
    const skipped = res?.skipped?.length || 0
    toast.success(skipped > 0 ? `导入 ${res.imported} 名，跳过 ${skipped} 名` : `成功导入 ${res?.imported || rows.length} 名学生`)
    importText.value = ''
    showImportForm.value = false
  } catch (error: any) {
    toast.error(error.response?.data?.error || '导入失败')
  }
}

onMounted(async () => {
  if (currentClass.value) {
    await loadStudents()
  }
})
</script>

<template>
  <PageLayout>
    <div class="max-w-5xl mx-auto">
      <div v-if="classes.length === 0" class="flex flex-col items-center justify-center min-h-[60vh]">
        <div class="text-7xl mb-6">🏫</div>
        <h3 class="text-2xl font-bold text-gray-700 mb-3">还没有班级</h3>
        <p class="text-gray-500 mb-6 text-lg">先创建一个班级，再添加学生账号。</p>
        <button @click="showClassModal = true" class="bg-gradient-to-r from-orange-400 to-pink-500 text-white px-6 py-3 rounded-2xl hover:shadow-lg transition-all font-bold">
          创建班级
        </button>
      </div>

      <template v-else>
        <div class="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 class="text-2xl font-bold text-gray-800">学生账号管理</h1>
            <p class="text-gray-500 text-sm mt-1">学号是学生登录账号和唯一 ID，创建后不支持修改。</p>
          </div>
          <div class="flex items-center gap-2">
            <button @click="showImportForm = true" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-xl font-medium transition-colors">批量导入</button>
            <button @click="showAddForm = true" class="px-4 py-2 text-sm text-white bg-gradient-to-r from-orange-400 to-pink-500 rounded-xl font-medium shadow-sm hover:shadow-md transition-all">添加学生</button>
          </div>
        </div>

        <div class="mb-4">
          <input v-model="searchQuery" type="text" placeholder="搜索姓名或学号" class="w-full max-w-sm border-2 border-gray-200 rounded-xl px-4 py-2 text-sm bg-white shadow-sm focus:outline-none focus:border-orange-400 transition-colors" />
        </div>

        <div v-if="isLoading" class="flex items-center justify-center py-20 text-gray-500">加载中...</div>
        <div v-else-if="!currentClass" class="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm">请先选择班级</div>
        <div v-else-if="students.length === 0" class="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm">
          <div class="text-6xl mb-4">👩‍🎓</div>
          <div>暂无学生</div>
          <button @click="showAddForm = true" class="mt-4 text-orange-500 hover:text-orange-600 font-medium">添加第一个学生</button>
        </div>

        <div v-else class="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div class="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-500">
            <div class="col-span-4">姓名</div>
            <div class="col-span-3">学号/登录账号</div>
            <div class="col-span-2 text-center">{{ editingStudent ? '重置密码' : '累计积分' }}</div>
            <div class="col-span-3 text-right">操作</div>
          </div>

          <div v-for="student in filteredStudents" :key="student.id" class="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors items-center">
            <template v-if="editingStudent?.id === student.id">
              <div class="col-span-4">
                <input v-model="editName" type="text" class="w-full border-2 border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-orange-400" />
              </div>
              <div class="col-span-3 text-sm text-gray-500">{{ student.student_no }}</div>
              <div class="col-span-2">
                <input v-model="editPassword" type="password" placeholder="留空不改密码" class="w-full border-2 border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-orange-400" />
              </div>
              <div class="col-span-3 text-right">
                <button @click="handleSaveEdit" class="text-green-500 hover:text-green-600 text-sm font-medium px-2 py-1">保存</button>
                <button @click="cancelEdit" class="text-gray-400 hover:text-gray-600 text-sm font-medium px-2 py-1">取消</button>
              </div>
            </template>
            <template v-else>
              <div class="col-span-4 font-medium text-gray-800">{{ student.name }}</div>
              <div class="col-span-3 text-sm text-gray-500">{{ student.student_no }}</div>
              <div class="col-span-2 text-sm font-medium text-orange-500 text-center">{{ student.total_points }}</div>
              <div class="col-span-3 text-right">
                <button @click="startEdit(student)" class="text-blue-500 hover:text-blue-600 text-sm px-2">编辑</button>
                <button @click="handleDeleteStudent(student)" class="text-red-400 hover:text-red-600 text-sm px-2">删除</button>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>

    <Transition name="modal">
      <div v-if="showAddForm" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" @click.self="showAddForm = false">
        <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <h3 class="text-lg font-bold mb-4">添加学生账号</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-sm text-gray-500 mb-1">姓名 *</label>
              <input v-model="newStudentName" type="text" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label class="block text-sm text-gray-500 mb-1">学号 *</label>
              <input v-model="newStudentNo" type="text" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label class="block text-sm text-gray-500 mb-1">密码 *</label>
              <input v-model="newPassword" type="password" class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400" @keyup.enter="handleAddStudent" />
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button @click="showAddForm = false" class="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors">取消</button>
            <button @click="handleAddStudent" class="px-4 py-2 bg-gradient-to-r from-orange-400 to-pink-500 text-white rounded-xl text-sm font-medium shadow-sm">添加</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showImportForm" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" @click.self="showImportForm = false">
        <div class="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
          <h3 class="text-lg font-bold mb-4">批量导入学生账号</h3>
          <p class="text-sm text-gray-500 mb-3">每行一个学生，格式：姓名,学号,密码</p>
          <textarea v-model="importText" rows="10" placeholder="张三,2026001,123456&#10;李四,2026002,123456" class="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 font-mono"></textarea>
          <div class="flex justify-end gap-2 mt-4">
            <button @click="showImportForm = false" class="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors">取消</button>
            <button @click="handleImportStudents" class="px-4 py-2 bg-gradient-to-r from-orange-400 to-pink-500 text-white rounded-xl text-sm font-medium shadow-sm">导入</button>
          </div>
        </div>
      </div>
    </Transition>

    <ConfirmDialog :show="confirmDialog.show" :title="confirmDialog.title" :message="confirmDialog.message" :confirm-text="confirmDialog.confirmText" :cancel-text="confirmDialog.cancelText" :type="confirmDialog.type" @confirm="confirmDialog.onConfirm" @cancel="closeConfirm" />
    <ClassModal :show="showClassModal" @close="showClassModal = false" @submit="handleCreateClass" />
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
